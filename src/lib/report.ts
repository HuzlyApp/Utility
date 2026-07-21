import type {
  AnalyzeResponse,
  JobInputState,
  CandidateInputState,
} from "./clientTypes";
import type { AiRequirement } from "./schema";
import { DISPLAY_ACTION } from "./types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function reqRows(reqs: AiRequirement[]): string {
  if (reqs.length === 0) return `<tr><td colspan="4">None identified.</td></tr>`;
  return reqs
    .map(
      (r) => `<tr>
        <td>${esc(r.requirement)}</td>
        <td>${esc(r.requirement_outcome)} (${esc(r.status)})</td>
        <td>${esc(r.candidate_evidence || "—")}</td>
        <td>${esc(r.impact || "—")}</td>
      </tr>`
    )
    .join("");
}

function list(items: string[]): string {
  if (!items || items.length === 0) return "<p>None.</p>";
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

// Builds a self-contained, printable HTML report (spec section 27). The recruiter
// can print it to PDF from the browser. Excludes prompts, model reasoning, and
// API metadata.
export function buildReportHtml(args: {
  data: AnalyzeResponse;
  jobInput: JobInputState;
  candidateInput: CandidateInputState;
}): string {
  const { data, jobInput } = args;
  const r = data.validated_result;
  const cm = r.candidate_match;
  const created = new Date(data.created_at).toLocaleString();

  const questions = r.screening_questions
    .map(
      (q) =>
        `<li><strong>${q.priority}. ${esc(q.question)}</strong><br/><em>${esc(
          q.reason
        )}</em></li>`
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Candidate Match Assessment${
    jobInput.job_title ? ` — ${esc(jobInput.job_title)}` : ""
  }</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 32px; line-height: 1.4; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 15px; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .score { font-size: 32px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  .meta { color: #475569; font-size: 12px; }
  .disclaimer { margin-top: 24px; padding: 10px; background: #fffbeb; border: 1px solid #fde68a; font-size: 12px; }
  .print-btn { margin-bottom: 16px; padding: 8px 16px; font-size: 14px; }
  @media print { .print-btn { display: none; } }
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <h1>Candidate Match Assessment</h1>
  <p class="meta">
    ${esc(jobInput.job_title || "Job")} ·
    ${esc(jobInput.msp_name || "MSP/Client")} ·
    Job ID: ${esc(jobInput.job_id || "—")}<br/>
    Generated: ${esc(created)}
  </p>

  <h2>Match summary</h2>
  <p class="score">${cm.recommended_overall_match_score}% — ${esc(
    cm.display_category
  )}</p>
  <p><strong>Recommended action:</strong> ${esc(
    DISPLAY_ACTION[cm.recommended_action]
  )}</p>
  <p><strong>Recruiter-selected disposition:</strong> _______________________</p>
  <p><strong>Submission readiness:</strong> ${esc(
    r.submission_readiness.readiness_status
  )} · <strong>Confidence:</strong> ${cm.confidence_score}%</p>
  <p>${esc(cm.recruiter_decision_summary)}</p>

  <h2>Experience analysis${r.experience_analysis.is_estimated ? " (estimated)" : ""}</h2>
  <p class="meta">
    Total: ${r.experience_analysis.total_professional_experience_years ?? "—"} yrs ·
    Specialty: ${r.experience_analysis.relevant_specialty_experience_years ?? "—"} yrs ·
    Recent: ${r.experience_analysis.recent_relevant_experience_years ?? "—"} yrs
  </p>
  ${list(r.experience_analysis.experience_calculation_notes)}

  <h2>Mandatory requirements</h2>
  <table><thead><tr><th>Requirement</th><th>Result</th><th>Evidence</th><th>Impact</th></tr></thead>
  <tbody>${reqRows(r.mandatory_requirements)}</tbody></table>

  <h2>Preferred requirements</h2>
  <table><thead><tr><th>Requirement</th><th>Result</th><th>Evidence</th><th>Impact</th></tr></thead>
  <tbody>${reqRows(r.preferred_requirements)}</tbody></table>

  <h2>Strengths</h2>
  ${list(r.strengths)}

  <h2>Gaps &amp; risks</h2>
  ${list(r.gaps_and_risks)}

  <h2>Screening questions</h2>
  <ol>${questions || "<li>None.</li>"}</ol>

  <h2>Submission readiness</h2>
  <p><strong>Ready to submit:</strong> ${
    r.submission_readiness.ready_to_submit ? "Yes" : "No"
  }</p>
  <strong>Items to verify:</strong> ${list(
    r.submission_readiness.items_to_verify_before_submission
  )}
  <strong>Blocking requirements:</strong> ${list(
    r.submission_readiness.blocking_requirements
  )}
  <strong>Documents/credentials needed:</strong> ${list(
    r.submission_readiness.documents_or_credentials_needed
  )}

  <div class="disclaimer">
    This assessment is AI-assisted decision support. It does not make the final
    employment or submission decision. A recruiter must verify mandatory
    qualifications and select the final disposition.
  </div>
</body></html>`;
}
