"use client";

import React from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { AlertIcon } from "@/components/ui/icons";
import { parseLabeledItem } from "@/lib/match-display";

export function RisksCard({ risks }: { risks: string[] }) {
  return (
    <Card>
      <CardHeader
        title="Gaps & risks"
        description="Tightened scoring rules — ownership depth, title fit, outcomes, logistics, and why the score is held down."
        icon={<AlertIcon className="h-5 w-5 text-amber-600" />}
      />
      <CardBody>
        {risks.length === 0 ? (
          <p className="text-sm text-slate-400">
            No gaps or scoring-rule risks were recorded.
          </p>
        ) : (
          <ul className="space-y-3">
            {risks.map((raw, i) => {
              const item = parseLabeledItem(raw);
              return (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <AlertIcon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 text-sm text-slate-700">
                    {item.label ? (
                      <>
                        <p className="font-semibold text-slate-900">
                          {item.label}
                        </p>
                        <p className="mt-0.5 text-slate-600">{item.detail}</p>
                      </>
                    ) : (
                      <p>{item.detail}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
