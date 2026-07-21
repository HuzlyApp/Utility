import "server-only";
import imageSize from "image-size";
import OpenAI from "openai";
import { config } from "./config";
import { extractText, getExtension, normalizeText } from "./extract";
import type { ExtractionQuality } from "./types";

// Supported upload types for BOTH job descriptions and candidate résumés (spec §5/§7).
export const DOC_EXTENSIONS = ["pdf", "doc", "docx", "txt"] as const;
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const ALL_EXTENSIONS = [...DOC_EXTENSIONS, ...IMAGE_EXTENSIONS] as const;

export type ExtractionMethod =
  | "TEXT_LAYER"
  | "DOCX"
  | "PLAINTEXT"
  | "OCR"
  | "VISION_FALLBACK"
  | "MANUAL"
  | "NONE";

const EXT_MIME: Record<string, string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  txt: ["text/plain"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};

export function isImageExtension(ext: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isSupportedUpload(filename: string): boolean {
  return (ALL_EXTENSIONS as readonly string[]).includes(getExtension(filename));
}

// Sniff a file signature (magic bytes) so a renamed/spoofed file is rejected.
function sniffSignature(buffer: Buffer): string | null {
  if (buffer.length >= 4) {
    if (buffer.slice(0, 4).toString("latin1") === "%PDF") return "pdf";
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return "png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
      return "docx"; // zip container (docx)
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0)
      return "doc"; // legacy OLE
  }
  if (
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString("latin1") === "RIFF" &&
    buffer.slice(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export interface FileValidation {
  ok: boolean;
  error?: string;
  ext: string;
  mimeType: string;
  isImage: boolean;
  width?: number;
  height?: number;
}

// Validates extension, declared MIME, file signature, size, and (for images)
// dimensions before anything is stored or processed (spec §5/§14).
export function validateUpload(
  buffer: Buffer,
  filename: string,
  declaredMime?: string
): FileValidation {
  const ext = getExtension(filename);
  const isImage = isImageExtension(ext);

  if (!isSupportedUpload(filename)) {
    return {
      ok: false,
      ext,
      isImage,
      mimeType: declaredMime ?? "",
      error: `Unsupported file type: .${ext || "unknown"}. Allowed: ${ALL_EXTENSIONS.join(", ")}.`,
    };
  }

  if (buffer.length === 0) {
    return { ok: false, ext, isImage, mimeType: declaredMime ?? "", error: "File is empty." };
  }

  if (buffer.length > config.maxUploadBytes) {
    return {
      ok: false,
      ext,
      isImage,
      mimeType: declaredMime ?? "",
      error: `File is too large. Maximum size is ${Math.round(
        config.maxUploadBytes / (1024 * 1024)
      )} MB.`,
    };
  }

  // Signature check (txt has no signature, so it is exempt).
  const sig = sniffSignature(buffer);
  if (ext !== "txt") {
    const expected = ext === "jpeg" ? "jpg" : ext;
    if (sig === null) {
      return {
        ok: false,
        ext,
        isImage,
        mimeType: declaredMime ?? "",
        error: "The file appears corrupt or is not the type its name claims.",
      };
    }
    if (sig !== expected) {
      return {
        ok: false,
        ext,
        isImage,
        mimeType: declaredMime ?? "",
        error: `File signature (${sig}) does not match extension (.${ext}).`,
      };
    }
  }

  // Declared MIME sanity check (best-effort; browsers vary).
  const allowedMimes = EXT_MIME[ext] ?? [];
  const mimeType = declaredMime && allowedMimes.includes(declaredMime)
    ? declaredMime
    : allowedMimes[0] ?? "application/octet-stream";

  let width: number | undefined;
  let height: number | undefined;
  if (isImage) {
    try {
      const dim = imageSize(buffer);
      width = dim.width;
      height = dim.height;
      const max = config.maxImageDimension;
      if ((width && width > max) || (height && height > max)) {
        return {
          ok: false,
          ext,
          isImage,
          mimeType,
          width,
          height,
          error: `Image is too large (${width}x${height}). Maximum dimension is ${max}px.`,
        };
      }
    } catch {
      return {
        ok: false,
        ext,
        isImage,
        mimeType,
        error: "The image could not be read. It may be corrupt or unsupported.",
      };
    }
  }

  return { ok: true, ext, isImage, mimeType, width, height };
}

export interface ExtractionOutcome {
  text: string;
  method: ExtractionMethod;
  quality: ExtractionQuality;
  ocrConfidence: number | null;
  isImage: boolean;
  needsReview: boolean;
  warnings: string[];
}

// Runs OCR on an image buffer using tesseract.js (spec §5). Returns confidence
// so the UI can surface "Needs Review" when extraction quality is low.
async function runOcr(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  // Imported lazily so the heavy OCR runtime only loads when an image is processed.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(buffer);
    return {
      text: normalizeText(data.text ?? ""),
      confidence: Math.round(data.confidence ?? 0),
    };
  } finally {
    await worker.terminate();
  }
}

function qualityFromOcr(text: string, confidence: number): ExtractionQuality {
  if (text.trim().length === 0) return "FAILED";
  if (confidence < 40 || text.trim().length < 80) return "LOW";
  if (confidence < config.ocrMinConfidence) return "MODERATE";
  return "HIGH";
}

// Dispatches extraction based on file type. Images -> OCR; documents -> text
// layer / DOCX / plaintext (reusing the existing extractor). Uncertain output
// is flagged needsReview and must never be treated as confirmed evidence.
export async function extractFromUpload(
  buffer: Buffer,
  filename: string,
  isImage: boolean
): Promise<ExtractionOutcome> {
  const ext = getExtension(filename);

  if (isImage) {
    try {
      const { text, confidence } = await runOcr(buffer);
      const quality = qualityFromOcr(text, confidence);
      return {
        text,
        method: "OCR",
        quality,
        ocrConfidence: confidence,
        isImage: true,
        needsReview: quality === "LOW" || quality === "FAILED" || confidence < config.ocrMinConfidence,
        warnings:
          confidence < config.ocrMinConfidence
            ? ["OCR confidence is low. Please review the extracted text before analysis."]
            : [],
      };
    } catch {
      return {
        text: "",
        method: "OCR",
        quality: "FAILED",
        ocrConfidence: 0,
        isImage: true,
        needsReview: true,
        warnings: ["OCR failed for this image. Review or re-upload, or edit the text manually."],
      };
    }
  }

  const result = await extractText(buffer, filename);
  const method: ExtractionMethod =
    ext === "pdf" ? "TEXT_LAYER" : ext === "txt" ? "PLAINTEXT" : "DOCX";
  return {
    text: result.text,
    method,
    quality: result.quality,
    ocrConfidence: null,
    isImage: false,
    needsReview: !result.success || result.quality === "LOW",
    warnings: result.warnings.concat(result.error ? [result.error] : []),
  };
}

let visionClient: OpenAI | null = null;
function getVisionClient(): OpenAI {
  if (!visionClient) {
    visionClient = new OpenAI({
      apiKey: config.xaiApiKey,
      baseURL: config.grokBaseUrl,
      timeout: config.xaiTimeoutMs,
      maxRetries: config.xaiMaxRetries,
    });
  }
  return visionClient;
}

// Controlled image-based fallback (spec §9): only used when OCR/standard
// extraction failed. Sends image(s) to the vision-capable Grok model and asks
// for a faithful transcription (no analysis, no invented content).
export async function visionTranscribe(
  images: Array<{ bytes: Buffer; mimeType: string }>
): Promise<{ text: string; ok: boolean }> {
  if (!config.xaiApiKey || images.length === 0) return { text: "", ok: false };
  try {
    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: "text",
        text:
          "Transcribe ALL readable text from the following résumé image(s) exactly as written. " +
          "Preserve headings, bullets, dates, and employers. Do not summarize, analyze, or add anything. " +
          "If some text is illegible, write [illegible]. Return only the transcription.",
      },
      ...images.map((img) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${img.mimeType};base64,${img.bytes.toString("base64")}`,
        },
      })),
    ];

    const completion = await getVisionClient().chat.completions.create({
      model: config.xaiVisionModel,
      temperature: 0,
      messages: [{ role: "user", content }],
    });
    const text = normalizeText(completion.choices[0]?.message?.content ?? "");
    return { text, ok: text.trim().length > 0 };
  } catch {
    return { text: "", ok: false };
  }
}
