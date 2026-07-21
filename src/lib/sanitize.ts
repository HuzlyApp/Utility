// Best-effort removal of irrelevant / protected personal data before text is
// sent to the model (spec section 24). This is intentionally conservative: it
// strips obvious PII patterns while preserving job-relevant content.

export interface SanitizeResult {
  text: string;
  removed: string[];
}

const PATTERNS: { label: string; regex: RegExp; replacement: string }[] = [
  // Dates of birth (labeled).
  {
    label: "date of birth",
    regex: /\b(date of birth|d\.?o\.?b\.?)\s*[:\-]?\s*[^\n]{0,30}/gi,
    replacement: "[DOB REMOVED]",
  },
  // Explicit age lines.
  {
    label: "age",
    regex: /\bage\s*[:\-]\s*\d{1,3}\b/gi,
    replacement: "[AGE REMOVED]",
  },
  // Photograph references and associated content on the same line.
  {
    label: "photo reference",
    regex: /\b(photo|photograph|headshot|profile picture)\b[\s:.-]*[^\n]*/gi,
    replacement: "[PHOTO REF REMOVED]",
  },
  // US SSN.
  {
    label: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[SSN REMOVED]",
  },
  // Marital status.
  {
    label: "marital status",
    regex: /\bmarital status\s*[:\-]?\s*(single|married|divorced|widowed|separated)\b/gi,
    replacement: "[MARITAL STATUS REMOVED]",
  },
  // Full US street address (number + street + suffix). Keeps city/state which
  // can be job-relevant for licensure/locality.
  {
    label: "street address",
    regex:
      /\b\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\b(?:street|st|avenue|ave|boulevard|blvd|road|rd|lane|ln|drive|dr|court|ct|way|place|pl)\b\.?/gi,
    replacement: "[STREET ADDRESS REMOVED]",
  },
];

export function sanitizeResumeText(input: string): SanitizeResult {
  let text = input;
  const removed: string[] = [];
  for (const p of PATTERNS) {
    if (p.regex.test(text)) {
      removed.push(p.label);
      text = text.replace(p.regex, p.replacement);
    }
    p.regex.lastIndex = 0;
  }
  return { text, removed };
}
