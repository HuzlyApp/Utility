import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { config } from "@/lib/config";
import type {
  DuplicateConfidence,
  DuplicateConfirmationPayload,
} from "./types";

const TOKEN_TTL_SECONDS = 15 * 60;

/** In-process single-use registry (jti → expiry ms). */
const usedTokens = new Map<string, number>();

function signingSecret(): string {
  return config.neonAuthCookieSecret || config.databaseUrl || "dev-duplicate-token-secret";
}

function base64urlEncode(data: string): string {
  return Buffer.from(data, "utf8")
    .toString("base64url");
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function signPayload(payloadB64: string): string {
  return createHmac("sha256", signingSecret())
    .update(payloadB64)
    .digest("base64url");
}

function pruneUsedTokens(now = Date.now()): void {
  for (const [jti, expMs] of usedTokens) {
    if (expMs <= now) usedTokens.delete(jti);
  }
}

export function issueDuplicateConfirmationToken(params: {
  userId: string;
  tenantId: string;
  candidateId: string;
  normalizedName: string;
  matchedCandidateIds: string[];
  matchedAnalysisIds: string[];
  confidence: DuplicateConfidence;
}): string {
  pruneUsedTokens();
  const payload: DuplicateConfirmationPayload = {
    uid: params.userId,
    tid: params.tenantId,
    cid: params.candidateId,
    nn: params.normalizedName,
    mcids: [...params.matchedCandidateIds].sort(),
    maids: [...params.matchedAnalysisIds].sort(),
    conf: params.confidence,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export type TokenVerificationResult =
  | { ok: true; payload: DuplicateConfirmationPayload }
  | { ok: false; reason: string };

export function verifyDuplicateConfirmationToken(
  token: string,
  expected: {
    userId: string;
    tenantId: string;
    candidateId: string;
    normalizedName: string;
    matchedCandidateIds: string[];
    matchedAnalysisIds: string[];
    confidence: DuplicateConfidence;
  }
): TokenVerificationResult {
  pruneUsedTokens();
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED_TOKEN" };

  const [payloadB64, sig] = parts;
  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  let payload: DuplicateConfirmationPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64)) as DuplicateConfirmationPayload;
  } catch {
    return { ok: false, reason: "MALFORMED_PAYLOAD" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) return { ok: false, reason: "TOKEN_EXPIRED" };
  if (usedTokens.has(payload.jti)) return { ok: false, reason: "TOKEN_ALREADY_USED" };

  if (payload.uid !== expected.userId) return { ok: false, reason: "USER_MISMATCH" };
  if (payload.tid !== expected.tenantId) return { ok: false, reason: "TENANT_MISMATCH" };
  if (payload.cid !== expected.candidateId) return { ok: false, reason: "CANDIDATE_MISMATCH" };
  if (payload.nn !== expected.normalizedName) return { ok: false, reason: "NAME_MISMATCH" };
  if (payload.conf !== expected.confidence) return { ok: false, reason: "CONFIDENCE_MISMATCH" };

  const mcids = [...payload.mcids].sort().join(",");
  const expectedMcids = [...expected.matchedCandidateIds].sort().join(",");
  if (mcids !== expectedMcids) return { ok: false, reason: "MATCHES_CHANGED" };

  const maids = [...payload.maids].sort().join(",");
  const expectedMaids = [...expected.matchedAnalysisIds].sort().join(",");
  if (maids !== expectedMaids) return { ok: false, reason: "MATCHES_CHANGED" };

  return { ok: true, payload };
}

/** Mark a verified token as consumed (single-use). */
export function consumeDuplicateConfirmationToken(jti: string, expSec: number): void {
  pruneUsedTokens();
  usedTokens.set(jti, expSec * 1000);
}

/** Test helper — clears the in-process used-token registry. */
export function resetDuplicateConfirmationTokensForTests(): void {
  usedTokens.clear();
}

export function duplicateTokenTtlSeconds(): number {
  return TOKEN_TTL_SECONDS;
}
