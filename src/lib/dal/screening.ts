import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import type { AppUser } from "@/lib/auth/session";

export interface ScreeningAnswer {
  id: string;
  question: string;
  answer: string | null;
  related_requirement: string | null;
  priority: number | null;
  updated_at: string;
}

export async function listScreeningAnswers(
  user: AppUser,
  candidateId: string,
  workspaceId: string
): Promise<ScreeningAnswer[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, question, answer, related_requirement, priority, updated_at
    FROM candidate_screening_answers
    WHERE candidate_id = ${candidateId} AND workspace_id = ${workspaceId}
      AND owner_user_id = ${user.id}
    ORDER BY priority ASC NULLS LAST, created_at ASC
  `) as ScreeningAnswer[];
  return rows;
}

// Upserts the recruiter's recorded answer for a screening question.
export async function saveScreeningAnswer(params: {
  user: AppUser;
  candidateId: string;
  workspaceId: string;
  analysisId?: string | null;
  question: string;
  answer: string;
  relatedRequirement?: string;
  priority?: number;
}): Promise<void> {
  const sql = getSql();
  const existing = (await sql`
    SELECT id FROM candidate_screening_answers
    WHERE candidate_id = ${params.candidateId} AND workspace_id = ${params.workspaceId}
      AND owner_user_id = ${params.user.id} AND question = ${params.question}
    LIMIT 1
  `) as { id: string }[];

  if (existing.length > 0) {
    await sql`
      UPDATE candidate_screening_answers
      SET answer = ${params.answer}, updated_at = now()
      WHERE id = ${existing[0].id}
    `;
  } else {
    await sql`
      INSERT INTO candidate_screening_answers (
        candidate_id, workspace_id, analysis_id, owner_user_id, question, answer,
        related_requirement, priority, created_by
      ) VALUES (
        ${params.candidateId}, ${params.workspaceId}, ${params.analysisId ?? null},
        ${params.user.id}, ${params.question}, ${params.answer},
        ${params.relatedRequirement ?? null}, ${params.priority ?? null}, ${params.user.id}
      )
    `;
  }

  await audit({
    actorUserId: params.user.id,
    tenantId: params.user.tenantId,
    entityType: "candidate",
    entityId: params.candidateId,
    action: "SCREENING_ANSWER_SAVED",
  });
}
