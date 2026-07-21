import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { createWorkspace, type WorkspaceInput } from "@/lib/dal/workspaces";
import type { StructuredJobFields } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateBody extends WorkspaceInput {
  structured_requirements?: StructuredJobFields;
}

export async function POST(req: NextRequest) {
  return withUser("workspaces.create", async (user) => {
    const body = (await req.json()) as CreateBody;
    if (!body.job_description_text || !body.job_description_text.trim()) {
      return fail("A job description is required to create a workspace.", 400, "MISSING_JD");
    }
    const id = await createWorkspace(user, body);
    return ok({ id });
  });
}
