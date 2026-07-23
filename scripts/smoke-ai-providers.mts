/**
 * Live dual-provider smoke test (server-side only).
 * Usage: node --import tsx scripts/smoke-ai-providers.mts
 * Or: npx tsx scripts/smoke-ai-providers.mts
 */
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const { analyzeCandidate } = await import("../src/lib/ai/analyze-candidate.ts");

const job = `CT Technologist — Night shift
Requirements:
- ARRT(CT) required
- 2+ years hospital CT experience
- BLS
- Epic charting preferred
`;

const resumes = [
  {
    name: "Candidate A",
    text: `Jane Rivera, RT(R)(CT)
ARRT(CT) certified 2019. BLS current.
5 years hospital CT at Memorial Medical Center.
Epic Radiant experience. Trauma Level II CT coverage.
`,
  },
  {
    name: "Candidate B",
    text: `Sam Ortiz, RT(R)
Radiography only. No CT certification listed.
1 year outpatient x-ray. No hospital CT experience mentioned.
`,
  },
];

const providers = [
  { provider: "grok", optionId: "grok-4.5" },
  { provider: "claude", optionId: "claude" },
] as const;

for (const sel of providers) {
  console.log(`\n=== Provider: ${sel.provider} ===`);
  for (const resume of resumes) {
    try {
      const result = await analyzeCandidate({
        provider: sel.provider,
        optionId: sel.optionId,
        job_title: "CT Technologist",
        job_description_text: job,
        resume_text: resume.text,
        recent_experience_months: 24,
      });
      const cm = result.aiResult.candidate_match;
      console.log(
        JSON.stringify({
          candidate: resume.name,
          provider: result.provider,
          model: result.model,
          score: cm.recommended_overall_match_score,
          category: cm.match_category,
          action: cm.recommended_action,
          strengths: result.aiResult.strengths?.slice(0, 2),
          risks: result.aiResult.gaps_and_risks?.slice(0, 2),
        })
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          candidate: resume.name,
          provider: sel.provider,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }
}

console.log("\nSmoke test finished.");
