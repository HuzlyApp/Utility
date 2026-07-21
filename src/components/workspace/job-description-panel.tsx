"use client";

import React, { useState } from "react";
import { Card, CardBody, CardHeader, Button } from "@/components/ui/primitives";

export function JobDescriptionPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const preview = text.slice(0, 280);
  return (
    <Card>
      <CardHeader
        title="Full job description"
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Collapse" : "View Full Description"}
          </Button>
        }
      />
      <CardBody>
        <p className="whitespace-pre-line text-sm text-slate-700">
          {open ? text : preview + (text.length > 280 ? "…" : "")}
        </p>
      </CardBody>
    </Card>
  );
}
