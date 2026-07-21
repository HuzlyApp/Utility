import type { NextRequest } from "next/server";
import { updateDisposition } from "@/lib/db";
import { persistenceEnabled } from "@/lib/config";
import { ok, fail, logServerError } from "@/lib/http";
import {
  RECRUITER_DISPOSITIONS,
  DISPOSITIONS_REQUIRING_NOTE,
  type RecruiterDisposition,
} from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  try {
    const body = (await req.json()) as {
      recruiter_disposition?: string;
      recruiter_notes?: string;
    };

    const disposition = body.recruiter_disposition as RecruiterDisposition;
    if (!RECRUITER_DISPOSITIONS.includes(disposition)) {
      return fail("Invalid recruiter disposition.", 400, "INVALID_DISPOSITION");
    }

    if (
      DISPOSITIONS_REQUIRING_NOTE.includes(disposition) &&
      (!body.recruiter_notes || body.recruiter_notes.trim().length === 0)
    ) {
      return fail(
        "A note is required for this disposition.",
        400,
        "NOTE_REQUIRED"
      );
    }

    if (!persistenceEnabled()) {
      // Without a DB we can still acknowledge the recruiter's selection so the
      // UI reflects it; it simply is not persisted.
      return ok({ persisted: false, recruiter_disposition: disposition });
    }

    const updated = await updateDisposition({
      analysisId: params.analysisId,
      disposition,
      notes: body.recruiter_notes,
    });
    if (!updated) {
      return fail("Analysis not found.", 404, "NOT_FOUND");
    }
    return ok({ persisted: true, recruiter_disposition: disposition });
  } catch (err) {
    logServerError("disposition", err);
    return fail("Could not save the disposition.", 500, "SERVER_ERROR");
  }
}
