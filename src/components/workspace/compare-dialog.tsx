"use client";

import React, { useEffect, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { DISPLAY_CATEGORY, type MatchCategory } from "@/lib/types";
import type { AiResult } from "@/lib/schema";

export interface CompareEntry {
  analysisId: string;
  name: string;
}

interface Loaded {
  analysis_id: string;
  name: string;
  validated_result: AiResult;
}

function mandatoryCounts(r: AiResult) {
  const m = r.mandatory_requirements;
  return {
    met: m.filter((x) => x.requirement_outcome === "MET").length,
    verify: m.filter((x) => x.requirement_outcome === "VERIFY" || x.requirement_outcome === "CONFLICT").length,
    notMet: m.filter((x) => x.requirement_outcome === "NOT_MET").length,
    total: m.length,
  };
}

// Side-by-side comparison focused on requirements, evidence, gaps, and
// submission readiness — not just the percentage (spec §10).
export function CompareDialog({
  entries,
  onClose,
}: {
  entries: CompareEntry[];
  onClose: () => void;
}) {
  const [items, setItems] = useState<Loaded[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.all(
        entries.map(async (entry) => {
          const res = await fetch(`/api/analyses/${entry.analysisId}`);
          const data = await res.json();
          return res.ok && data.success
            ? ({
                analysis_id: data.analysis_id,
                name: entry.name,
                validated_result: data.validated_result,
              } as Loaded)
            : null;
        })
      );
      if (active) {
        setItems(results.filter(Boolean) as Loaded[]);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [entries]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/50 p-4">
      <div className="mt-6 w-full max-w-6xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-semibold text-slate-900">Compare candidates</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="p-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading comparison…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <tbody>
                  <Row label="Candidate">
                    {items.map((it) => (
                      <td key={it.analysis_id} className="px-3 py-2 font-semibold text-slate-900">
                        {it.name || "Candidate"}
                      </td>
                    ))}
                  </Row>
                  <Row label="Match score">
                    {items.map((it) => (
                      <td key={it.analysis_id} className="px-3 py-2">
                        <Badge tone="blue">
                          {it.validated_result.candidate_match.recommended_overall_match_score}%
                        </Badge>
                      </td>
                    ))}
                  </Row>
                  <Row label="Category">
                    {items.map((it) => (
                      <td key={it.analysis_id} className="px-3 py-2 text-slate-700">
                        {DISPLAY_CATEGORY[it.validated_result.candidate_match.match_category as MatchCategory] ??
                          it.validated_result.candidate_match.match_category}
                      </td>
                    ))}
                  </Row>
                  <Row label="Submission readiness">
                    {items.map((it) => (
                      <td key={it.analysis_id} className="px-3 py-2 text-slate-700">
                        {it.validated_result.submission_readiness.readiness_status.replace(/_/g, " ")}
                      </td>
                    ))}
                  </Row>
                  <Row label="Mandatory (met / verify / not met)">
                    {items.map((it) => {
                      const c = mandatoryCounts(it.validated_result);
                      return (
                        <td key={it.analysis_id} className="px-3 py-2">
                          <span className="text-green-700">{c.met}</span> /{" "}
                          <span className="text-amber-700">{c.verify}</span> /{" "}
                          <span className="text-red-700">{c.notMet}</span>
                          <span className="text-slate-400"> of {c.total}</span>
                        </td>
                      );
                    })}
                  </Row>
                  <Row label="Strengths">
                    {items.map((it) => (
                      <td key={it.analysis_id} className="px-3 py-2 align-top text-xs text-slate-600">
                        <ul className="list-disc pl-4">
                          {it.validated_result.strengths.slice(0, 4).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                          {it.validated_result.strengths.length === 0 && <li>—</li>}
                        </ul>
                      </td>
                    ))}
                  </Row>
                  <Row label="Gaps & risks">
                    {items.map((it) => (
                      <td key={it.analysis_id} className="px-3 py-2 align-top text-xs text-slate-600">
                        <ul className="list-disc pl-4">
                          {it.validated_result.gaps_and_risks.slice(0, 4).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                          {it.validated_result.gaps_and_risks.length === 0 && <li>—</li>}
                        </ul>
                      </td>
                    ))}
                  </Row>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-slate-100">
      <th className="w-48 bg-slate-50 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">
        {label}
      </th>
      {children}
    </tr>
  );
}
