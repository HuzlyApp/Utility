"use client";

import React, { useState } from "react";
import { Card, CardBody, CardHeader, Button } from "@/components/ui/primitives";

/**
 * Decode the handful of HTML entities that can survive plain-text extraction
 * from DOCX/PDF/HTML job postings. We deliberately do not run a full entity
 * decoder to avoid altering legitimate ampersand text.
 */
function decodeCommonEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export function JobDescriptionPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const decoded = decodeCommonEntities(text);
  const preview = decoded.slice(0, 280);
  const isLong = decoded.length > 280;

  return (
    <Card>
      <CardHeader
        title="Full job description"
        action={
          isLong ? (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? "Collapse" : "View Full Description"}
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
          {open ? decoded : preview + (isLong ? "…" : "")}
        </p>
      </CardBody>
    </Card>
  );
}
