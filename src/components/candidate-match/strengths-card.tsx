"use client";

import React from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { CheckIcon, TrophyIcon } from "@/components/ui/icons";

export function StrengthsCard({ strengths }: { strengths: string[] }) {
  return (
    <Card>
      <CardHeader
        title="Documented Strengths"
        icon={<TrophyIcon className="h-5 w-5 text-emerald-600" />}
      />
      <CardBody>
        {strengths.length === 0 ? (
          <p className="text-sm text-slate-400">No strengths captured.</p>
        ) : (
          <ul className="space-y-2.5">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-green-100 text-green-700">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-slate-700">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
