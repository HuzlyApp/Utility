import type { AnalysisProgressEvent } from "@/lib/analysis-stages";

export class AnalyzeRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AnalyzeRequestError";
    this.code = code;
  }
}

/**
 * Starts workspace candidate analysis and consumes NDJSON progress events.
 * Falls back to a single JSON body if the server does not stream.
 */
export async function analyzeCandidateStream(options: {
  workspaceId: string;
  candidateId: string;
  body: Record<string, unknown>;
  onProgress?: (event: AnalysisProgressEvent) => void;
  signal?: AbortSignal;
}): Promise<AnalysisProgressEvent> {
  const { workspaceId, candidateId, body, onProgress, signal } = options;

  const res = await fetch(
    `/api/workspaces/${workspaceId}/candidates/${candidateId}/analyze`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson, application/json",
      },
      body: JSON.stringify(body),
      signal,
    }
  );

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-ndjson") && res.body) {
    return readNdjsonStream(res, onProgress);
  }

  // Non-streaming JSON (errors before the stream starts, or legacy responses).
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.success === false) {
    throw new AnalyzeRequestError(
      String(data.error ?? "Analysis failed."),
      typeof data.code === "string" ? data.code : undefined
    );
  }

  const completed: AnalysisProgressEvent = {
    stage: "completed",
    progress: 100,
    message: "Analysis completed",
    analysis_id: data.analysis_id as string | undefined,
    candidate_id: (data.candidate_id as string | undefined) ?? candidateId,
    overall_match_score: data.overall_match_score as number | undefined,
    match_category: data.match_category as string | undefined,
    submission_readiness: data.submission_readiness as string | undefined,
    recommended_action: data.recommended_action as string | undefined,
    ai_provider: data.ai_provider as string | undefined,
    ai_model: data.ai_model as string | undefined,
  };
  onProgress?.(completed);
  return completed;
}

async function readNdjsonStream(
  res: Response,
  onProgress?: (event: AnalysisProgressEvent) => void
): Promise<AnalysisProgressEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: AnalysisProgressEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: AnalysisProgressEvent;
      try {
        event = JSON.parse(trimmed) as AnalysisProgressEvent;
      } catch {
        continue;
      }
      last = event;
      onProgress?.(event);
      if (event.stage === "failed") {
        throw new AnalyzeRequestError(event.error ?? "Analysis failed.", event.code);
      }
    }
  }

  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim()) as AnalysisProgressEvent;
      last = event;
      onProgress?.(event);
      if (event.stage === "failed") {
        throw new AnalyzeRequestError(event.error ?? "Analysis failed.", event.code);
      }
    } catch (err) {
      if (err instanceof AnalyzeRequestError) throw err;
    }
  }

  if (!last) {
    throw new AnalyzeRequestError("Analysis ended without a result.");
  }
  if (last.stage !== "completed") {
    throw new AnalyzeRequestError(last.error ?? "Analysis did not complete.");
  }
  return last;
}
