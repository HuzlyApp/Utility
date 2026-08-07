import type { NextRequest } from "next/server";
import { POST as reextractPost } from "@/app/api/candidates/[candidateId]/reextract-contact/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Alias for manual contact-extraction retry.
 * POST /api/candidates/{id}/contact-extraction/retry
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { candidateId: string } }
) {
  return reextractPost(req, ctx);
}
