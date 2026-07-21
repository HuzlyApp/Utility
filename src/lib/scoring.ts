import type { AiResult, AiRequirement } from "./schema";
import {
  DISPLAY_CATEGORY,
  STATUS_SCORE_MAP,
  SUBSCORE_WEIGHTS,
  type MatchCategory,
  type RecommendedAction,
  type RequirementOutcome,
  type SubscoreKey,
  type SubmissionReadiness,
} from "./types";

/**
 * Deterministic evidence-status -> requirement-outcome mapping (spec §2/§22).
 *
 * The critical fairness rule: absence of evidence is NOT evidence of absence.
 * A requirement that is simply missing from the résumé (NOT_FOUND) — or a
 * NOT_MET the model asserted without any supporting evidence — must become
 * VERIFY, never a clear failure. NOT_MET survives only when the candidate
 * evidence explicitly contradicts the requirement.
 */
export function normalizeOutcome(r: AiRequirement): RequirementOutcome {
  if (r.status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (r.status === "CONFLICTING") return "CONFLICT";

  if (r.requirement_outcome === "NOT_MET") {
    // Only a documented contradiction (evidence present, status not NOT_FOUND)
    // can be a clear failure. Otherwise downgrade to VERIFY.
    if (r.status === "NOT_FOUND" || r.candidate_evidence.trim() === "") {
      return "VERIFY";
    }
    return "NOT_MET";
  }

  if (r.status === "CONFIRMED") return "MET";
  if (r.status === "PARTIAL" || r.status === "NOT_FOUND") return "VERIFY";
  return r.requirement_outcome;
}

export interface ScoreValidationResult {
  result: AiResult;
  adjustments: string[];
}

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

// Average the deterministic status score across a set of requirements.
// NOT_APPLICABLE (null) requirements are excluded from the average.
function averageStatusScore(reqs: AiRequirement[]): number | null {
  const scored: number[] = [];
  for (const r of reqs) {
    // A clearly-unmet outcome always scores zero regardless of evidence status.
    if (r.requirement_outcome === "NOT_MET") {
      scored.push(0);
      continue;
    }
    const base = STATUS_SCORE_MAP[r.status];
    if (base === null) continue; // NOT_APPLICABLE
    scored.push(base);
  }
  if (scored.length === 0) return null;
  return scored.reduce((a, b) => a + b, 0) / scored.length;
}

// Category thresholds by numeric score (spec section 4).
function categoryFromScore(score: number): MatchCategory {
  if (score >= 90) return "STRONG_MATCH";
  if (score >= 75) return "GOOD_MATCH";
  if (score >= 60) return "POSSIBLE_MATCH";
  if (score >= 40) return "WEAK_MATCH";
  return "NOT_A_MATCH";
}

// Ordering of "optimism" for recommended actions so we can clamp an
// over-optimistic AI recommendation to what the final category supports.
const ACTION_RANK: Record<RecommendedAction, number> = {
  PRIORITIZE_AND_CALL: 5,
  CALL_AND_VERIFY: 4,
  KEEP_AS_POSSIBLE: 3,
  REDIRECT_TO_OTHER_JOB: 2,
  STOP_FOR_THIS_JOB: 1,
};

const MAX_ACTION_BY_CATEGORY: Record<MatchCategory, RecommendedAction> = {
  STRONG_MATCH: "PRIORITIZE_AND_CALL",
  GOOD_MATCH: "CALL_AND_VERIFY",
  POSSIBLE_MATCH: "CALL_AND_VERIFY",
  WEAK_MATCH: "KEEP_AS_POSSIBLE",
  NOT_A_MATCH: "REDIRECT_TO_OTHER_JOB",
  NOT_CURRENTLY_SUBMITTABLE: "CALL_AND_VERIFY",
  NEEDS_MORE_INFORMATION: "CALL_AND_VERIFY",
};

/**
 * Independently validates and recalculates the score, category, action,
 * confidence and submission readiness in application code. The AI's
 * recommended values are treated as advisory only.
 */
export function validateAndScore(ai: AiResult): ScoreValidationResult {
  const adjustments: string[] = [];
  const result: AiResult = structuredClone(ai);

  // 0. Normalize every requirement outcome deterministically so that missing
  //    or unsupported information can never be reported as a clear failure
  //    (spec §2/§22). This is the authoritative mapping.
  let downgraded = 0;
  for (const r of [
    ...result.mandatory_requirements,
    ...result.preferred_requirements,
  ]) {
    const normalized = normalizeOutcome(r);
    if (normalized !== r.requirement_outcome) {
      if (r.requirement_outcome === "NOT_MET") downgraded += 1;
      r.requirement_outcome = normalized;
    }
  }
  if (downgraded > 0) {
    adjustments.push(
      `${downgraded} requirement(s) reported NOT_MET without supporting evidence were reclassified as VERIFY (absence of evidence is not a clear failure).`
    );
  }

  const mandatory = result.mandatory_requirements;
  const preferred = result.preferred_requirements;

  // 1. Recompute the two subscores we can derive deterministically from the
  //    per-requirement evidence statuses.
  const mandatoryScore = averageStatusScore(mandatory);
  if (mandatoryScore !== null) {
    const rounded = Math.round(mandatoryScore);
    if (rounded !== result.subscores.mandatory_requirements_score) {
      adjustments.push(
        `Recomputed mandatory_requirements_score from evidence: ${result.subscores.mandatory_requirements_score} -> ${rounded}.`
      );
    }
    result.subscores.mandatory_requirements_score = rounded;
  }

  const preferredScore = averageStatusScore(preferred);
  if (preferredScore !== null) {
    const rounded = Math.round(preferredScore);
    if (rounded !== result.subscores.preferred_qualifications_score) {
      adjustments.push(
        `Recomputed preferred_qualifications_score from evidence: ${result.subscores.preferred_qualifications_score} -> ${rounded}.`
      );
    }
    result.subscores.preferred_qualifications_score = rounded;
  }

  // 2. Clamp every subscore into range (defensive against bad model output).
  (Object.keys(SUBSCORE_WEIGHTS) as SubscoreKey[]).forEach((k) => {
    const original = result.subscores[k];
    const clamped = clamp(Math.round(original));
    if (clamped !== original) {
      adjustments.push(`Clamped ${k} into 0-100 range: ${original} -> ${clamped}.`);
    }
    result.subscores[k] = clamped;
  });

  // 3. Weighted total, computed in code (spec section 8).
  let weightedTotal = 0;
  (Object.keys(SUBSCORE_WEIGHTS) as SubscoreKey[]).forEach((k) => {
    weightedTotal += SUBSCORE_WEIGHTS[k] * result.subscores[k];
  });
  const overallScore = clamp(Math.round(weightedTotal));
  if (overallScore !== result.candidate_match.recommended_overall_match_score) {
    adjustments.push(
      `Overall score recalculated from weighted subscores: AI recommended ${result.candidate_match.recommended_overall_match_score}, application computed ${overallScore}.`
    );
  }
  // AI's advisory score is preserved; the validated score is authoritative.
  result.candidate_match.recommended_overall_match_score = overallScore;

  // 4. Base category from the recomputed score.
  let category = categoryFromScore(overallScore);

  // 5. Mandatory-requirement override logic (spec section 10).
  const mandatoryNotMet = mandatory.filter(
    (r) => r.requirement_outcome === "NOT_MET"
  );
  const mandatoryConflict = mandatory.filter(
    (r) => r.requirement_outcome === "CONFLICT" || r.status === "CONFLICTING"
  );
  const mandatoryVerify = mandatory.filter(
    (r) => r.requirement_outcome === "VERIFY"
  );
  const mandatoryConfirmed = mandatory.filter(
    (r) => r.requirement_outcome === "MET"
  );
  const applicableMandatory = mandatory.filter(
    (r) => r.requirement_outcome !== "NOT_APPLICABLE"
  );

  let mandatoryOverride = false;

  if (mandatoryNotMet.length > 0) {
    // A clearly failed mandatory requirement forces NOT_CURRENTLY_SUBMITTABLE
    // regardless of the numeric score.
    category = "NOT_CURRENTLY_SUBMITTABLE";
    mandatoryOverride = true;
    adjustments.push(
      `Mandatory override applied: ${mandatoryNotMet.length} mandatory requirement(s) clearly not met -> NOT_CURRENTLY_SUBMITTABLE.`
    );
  } else if (result.data_quality.resume_completeness === "LOW") {
    // Too little information to defend a score-based recommendation.
    category = "NEEDS_MORE_INFORMATION";
    adjustments.push(
      "Resume completeness is LOW -> NEEDS_MORE_INFORMATION."
    );
  } else if (
    applicableMandatory.length > 0 &&
    mandatoryConfirmed.length === 0 &&
    mandatoryVerify.length + mandatoryConflict.length === applicableMandatory.length
  ) {
    // No mandatory requirement is confirmed and everything needs verification.
    category = "NEEDS_MORE_INFORMATION";
    adjustments.push(
      "No mandatory requirement is confirmed and all require verification -> NEEDS_MORE_INFORMATION."
    );
  } else if (
    category === "STRONG_MATCH" &&
    (mandatoryVerify.length > 0 || mandatoryConflict.length > 0)
  ) {
    // STRONG_MATCH requires ALL mandatory confirmed with no contradictions.
    category = "GOOD_MATCH";
    adjustments.push(
      "Downgraded STRONG_MATCH to GOOD_MATCH: not all mandatory requirements are confirmed."
    );
  }

  result.candidate_match.match_category = category;
  result.candidate_match.display_category = DISPLAY_CATEGORY[category];
  result.candidate_match.mandatory_requirement_override = mandatoryOverride;

  // 6. Confidence: start from AI confidence, reduce for each detected conflict.
  const conflictCount =
    result.data_quality.job_description_conflicts.length +
    result.data_quality.resume_conflicts.length +
    mandatoryConflict.length;
  if (conflictCount > 0) {
    const penalty = Math.min(40, conflictCount * 10);
    const before = result.candidate_match.confidence_score;
    result.candidate_match.confidence_score = clamp(before - penalty);
    adjustments.push(
      `Confidence reduced by ${penalty} due to ${conflictCount} detected conflict(s): ${before} -> ${result.candidate_match.confidence_score}.`
    );
  }

  // 7. Clamp recommended action to what the final category supports.
  const maxAction = MAX_ACTION_BY_CATEGORY[category];
  if (
    ACTION_RANK[result.candidate_match.recommended_action] >
    ACTION_RANK[maxAction]
  ) {
    adjustments.push(
      `Recommended action clamped from ${result.candidate_match.recommended_action} to ${maxAction} to match category ${category}.`
    );
    result.candidate_match.recommended_action = maxAction;
  }

  // 8. Deterministic submission readiness.
  const readiness = deriveReadiness({
    category,
    mandatoryNotMet: mandatoryNotMet.length,
    mandatoryVerify: mandatoryVerify.length,
    mandatoryConflict: mandatoryConflict.length,
    applicableMandatory: applicableMandatory.length,
    mandatoryConfirmed: mandatoryConfirmed.length,
  });
  if (readiness !== result.submission_readiness.readiness_status) {
    adjustments.push(
      `Submission readiness set to ${readiness} by application rules (AI suggested ${result.submission_readiness.readiness_status}).`
    );
  }
  result.submission_readiness.readiness_status = readiness;
  result.submission_readiness.ready_to_submit = readiness === "READY_TO_SUBMIT";

  return { result, adjustments };
}

function deriveReadiness(args: {
  category: MatchCategory;
  mandatoryNotMet: number;
  mandatoryVerify: number;
  mandatoryConflict: number;
  applicableMandatory: number;
  mandatoryConfirmed: number;
}): SubmissionReadiness {
  if (args.mandatoryNotMet > 0) return "NOT_CURRENTLY_SUBMITTABLE";
  if (args.category === "NEEDS_MORE_INFORMATION") return "INSUFFICIENT_INFORMATION";
  if (args.mandatoryVerify > 0 || args.mandatoryConflict > 0)
    return "VERIFY_BEFORE_SUBMISSION";
  if (
    args.applicableMandatory > 0 &&
    args.mandatoryConfirmed === args.applicableMandatory
  )
    return "READY_TO_SUBMIT";
  return "VERIFY_BEFORE_SUBMISSION";
}

// Convenience counts used by the result summary card.
export function summarizeMandatory(reqs: AiRequirement[]) {
  return {
    confirmed: reqs.filter((r) => r.requirement_outcome === "MET").length,
    to_verify: reqs.filter(
      (r) =>
        r.requirement_outcome === "VERIFY" || r.requirement_outcome === "CONFLICT"
    ).length,
    not_met: reqs.filter((r) => r.requirement_outcome === "NOT_MET").length,
  };
}
