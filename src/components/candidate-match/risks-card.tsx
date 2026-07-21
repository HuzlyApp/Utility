"use client";

import React from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { AlertIcon } from "@/components/ui/icons";

export function RisksCard({ risks }: { risks: string[] }) {
  return (
    <Card>
      <CardHeader
        title="Gaps & Risks"
        icon={<AlertIcon className="h-5 w-5 text-amber-600" />}
      />
      <CardBody>
        {risks.length === 0 ? (
          <p className="text-sm text-slate-400">No gaps or risks captured.</p>
        ) : (
          <ul className="space-y-2.5">
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <AlertIcon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-slate-700">{r}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
