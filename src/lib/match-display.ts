export type LabeledItem = {
  label: string | null;
  detail: string;
};

/** Parse "Label — detail" or "Label: detail" recruiter bullets from model output. */
export function parseLabeledItem(raw: string): LabeledItem {
  const text = raw.trim();
  const emDash = text.match(/^(.{2,80}?)\s+[—–-]\s+(.+)$/s);
  if (emDash) {
    return { label: emDash[1].trim(), detail: emDash[2].trim() };
  }
  const colon = text.match(/^(.{2,60}?):\s+(.+)$/s);
  if (colon && !colon[1].includes(".")) {
    return { label: colon[1].trim(), detail: colon[2].trim() };
  }
  return { label: null, detail: text };
}

export function formatLabeledItem(item: LabeledItem): string {
  return item.label ? `${item.label} — ${item.detail}` : item.detail;
}

export function confidenceBand(score: number): "High" | "Medium" | "Low" {
  if (score >= 80) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

export function labeledItemFromUnknown(obj: Record<string, unknown>): string {
  const label =
    pickString(obj, ["title", "label", "heading", "gap", "strength", "name"]) ??
    null;
  const detail =
    pickString(obj, [
      "text",
      "detail",
      "explanation",
      "reason",
      "risk",
      "message",
      "note",
    ]) ?? "";
  if (label && detail) return `${label} — ${detail}`;
  if (detail) return detail;
  if (label) return label;
  return JSON.stringify(obj);
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
