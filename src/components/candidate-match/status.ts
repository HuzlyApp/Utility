import type { BadgeTone } from "@/components/ui/primitives";
import type {
  EvidenceStatus,
  MatchCategory,
  RequirementOutcome,
  SubmissionReadiness,
} from "@/lib/types";

// Category → badge tone + hero gradient. Incomplete-info categories use neutral
// styling; strong red is reserved for clearly failed/blocked (spec §12).
export const CATEGORY_TONE: Record<MatchCategory, BadgeTone> = {
  STRONG_MATCH: "green",
  GOOD_MATCH: "emerald",
  POSSIBLE_MATCH: "amber",
  WEAK_MATCH: "orange",
  NOT_A_MATCH: "red",
  NOT_CURRENTLY_SUBMITTABLE: "red",
  NEEDS_MORE_INFORMATION: "slate",
};

export const CATEGORY_HERO: Record<MatchCategory, string> = {
  STRONG_MATCH: "from-green-600 to-emerald-600",
  GOOD_MATCH: "from-emerald-600 to-teal-600",
  POSSIBLE_MATCH: "from-amber-500 to-orange-500",
  WEAK_MATCH: "from-orange-500 to-orange-600",
  NOT_A_MATCH: "from-red-600 to-rose-700",
  NOT_CURRENTLY_SUBMITTABLE: "from-red-700 to-rose-800",
  NEEDS_MORE_INFORMATION: "from-slate-600 to-slate-700",
};

export const CATEGORY_RING_COLOR: Record<MatchCategory, string> = {
  STRONG_MATCH: "text-green-600",
  GOOD_MATCH: "text-emerald-600",
  POSSIBLE_MATCH: "text-amber-500",
  WEAK_MATCH: "text-orange-500",
  NOT_A_MATCH: "text-red-600",
  NOT_CURRENTLY_SUBMITTABLE: "text-red-700",
  NEEDS_MORE_INFORMATION: "text-slate-500",
};

// Soft/light hero styling — strong red is reserved for a confirmed mandatory
// failure (NOT_CURRENTLY_SUBMITTABLE); missing info uses a calm blue (spec §3).
export interface CategorySoft {
  bg: string;
  border: string;
  accent: string;
  ring: string;
}
export const CATEGORY_SOFT: Record<MatchCategory, CategorySoft> = {
  STRONG_MATCH: {
    bg: "bg-green-50",
    border: "border-green-200",
    accent: "text-green-700",
    ring: "text-green-600",
  },
  GOOD_MATCH: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    accent: "text-emerald-700",
    ring: "text-emerald-600",
  },
  POSSIBLE_MATCH: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    accent: "text-amber-700",
    ring: "text-amber-500",
  },
  WEAK_MATCH: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    accent: "text-orange-700",
    ring: "text-orange-500",
  },
  NOT_A_MATCH: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    accent: "text-rose-700",
    ring: "text-rose-400",
  },
  NOT_CURRENTLY_SUBMITTABLE: {
    bg: "bg-red-50",
    border: "border-red-200",
    accent: "text-red-700",
    ring: "text-red-600",
  },
  NEEDS_MORE_INFORMATION: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    accent: "text-blue-700",
    ring: "text-blue-600",
  },
};

export interface RequirementVisual {
  tone: BadgeTone;
  label: string;
}

// Suggested recruiter action per requirement outcome (spec §8 table).
export function recruiterActionFor(
  status: EvidenceStatus,
  outcome: RequirementOutcome
): string {
  if (outcome === "MET") return "None";
  if (outcome === "NOT_MET") return "Blocking — confirm with candidate";
  if (outcome === "CONFLICT" || status === "CONFLICTING")
    return "Resolve conflict";
  if (status === "PARTIAL") return "Confirm details";
  if (status === "NOT_FOUND") return "Ask candidate";
  if (outcome === "VERIFY") return "Verify";
  return "Review";
}

// Maps evidence status + outcome to a badge tone + human label (spec §15/§22).
export function requirementVisual(
  status: EvidenceStatus,
  outcome: RequirementOutcome
): RequirementVisual {
  if (outcome === "NOT_MET") return { tone: "red", label: "Not Met" };
  if (outcome === "CONFLICT" || status === "CONFLICTING")
    return { tone: "red", label: "Conflict" };
  if (status === "CONFIRMED" && outcome === "MET")
    return { tone: "green", label: "Confirmed" };
  if (status === "PARTIAL") return { tone: "amber", label: "Partial" };
  if (outcome === "VERIFY") return { tone: "amber", label: "Verify" };
  if (status === "NOT_FOUND") return { tone: "slate", label: "Not Found" };
  if (status === "NOT_APPLICABLE" || outcome === "NOT_APPLICABLE")
    return { tone: "slate", label: "Not Applicable" };
  return { tone: "slate", label: status };
}

export const READINESS_META: Record<
  SubmissionReadiness,
  { label: string; tone: BadgeTone }
> = {
  READY_TO_SUBMIT: { label: "Ready to Submit", tone: "green" },
  VERIFY_BEFORE_SUBMISSION: { label: "Verify Before Submission", tone: "amber" },
  NOT_CURRENTLY_SUBMITTABLE: { label: "Not Currently Submittable", tone: "red" },
  INSUFFICIENT_INFORMATION: { label: "Insufficient Information", tone: "slate" },
};
