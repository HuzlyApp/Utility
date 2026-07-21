import mammoth from "mammoth";
import type { ExtractionQuality } from "./types";
import { config } from "./config";

export interface ExtractionResult {
  success: boolean;
  text: string;
  quality: ExtractionQuality;
  warnings: string[];
  error?: string;
}

export const SUPPORTED_EXTENSIONS = ["pdf", "doc", "docx", "txt"] as const;

export function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

export function isSupported(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(
    getExtension(filename)
  );
}

// Collapse excess whitespace while preserving line structure (headings, bullets,
// dates, employers) so the model retains résumé/job structure (spec section 20).
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/[ ]+$/g, ""))
    .join("\n")
    .trim();
}

function assessQuality(text: string): ExtractionQuality {
  const length = text.trim().length;
  if (length === 0) return "FAILED";
  if (length < 200) return "LOW";
  // Heuristic: very few whitespace runs relative to length can indicate a
  // garbled extraction, but for the MVP we treat any reasonably long text as HIGH.
  if (length < 600) return "MODERATE";
  return "HIGH";
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Import the internal module directly to avoid pdf-parse's index.js debug
  // harness which tries to read a bundled test file at require time.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    b: Buffer
  ) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text ?? "";
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value ?? "";
}

export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const ext = getExtension(filename);

  if (!isSupported(filename)) {
    return {
      success: false,
      text: "",
      quality: "FAILED",
      warnings,
      error: `Unsupported file type: .${ext || "unknown"}. Supported types are PDF, DOC, DOCX, and TXT.`,
    };
  }

  if (buffer.length > config.maxUploadBytes) {
    return {
      success: false,
      text: "",
      quality: "FAILED",
      warnings,
      error: `File is too large. Maximum size is ${Math.round(
        config.maxUploadBytes / (1024 * 1024)
      )} MB.`,
    };
  }

  let rawText = "";
  try {
    switch (ext) {
      case "pdf":
        rawText = await extractPdf(buffer);
        break;
      case "docx":
      case "doc":
        // Mammoth targets .docx; legacy .doc may extract poorly.
        if (ext === "doc") {
          warnings.push(
            "Legacy .doc files may not extract cleanly. If the result looks wrong, please save as .docx, PDF, or paste the text."
          );
        }
        rawText = await extractDocx(buffer);
        break;
      case "txt":
        rawText = buffer.toString("utf-8");
        break;
      default:
        return {
          success: false,
          text: "",
          quality: "FAILED",
          warnings,
          error: `Unsupported file type: .${ext}.`,
        };
    }
  } catch (err) {
    return {
      success: false,
      text: "",
      quality: "FAILED",
      warnings,
      error:
        ext === "pdf"
          ? "We could not read this PDF. It may be password-protected or contain only scanned images. Please upload another file or paste the text."
          : "We could not extract readable text from this file. Please upload another file or paste the text.",
    };
  }

  const text = normalizeText(rawText);
  const quality = assessQuality(text);

  if (quality === "FAILED") {
    return {
      success: false,
      text: "",
      quality,
      warnings,
      error:
        "We could not extract readable text from this file. It may be a scanned image. Please paste the text instead.",
    };
  }

  if (quality === "LOW") {
    warnings.push(
      "Very little text was extracted. Please confirm the content or paste the text manually."
    );
  }

  return { success: true, text, quality, warnings };
}
