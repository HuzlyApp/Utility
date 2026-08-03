"use client";

import React, { useState } from "react";
import { Card, CardBody, CardHeader, Button } from "@/components/ui/primitives";
import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

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

export function JobDescriptionPanel({
  text,
  cardExpanded = true,
  onCardExpandedChange,
}: {
  text: string;
  /** When provided with onCardExpandedChange, card body collapse is controlled externally. */
  cardExpanded?: boolean;
  onCardExpandedChange?: (expanded: boolean) => void;
}) {
  const [textOpen, setTextOpen] = useState(false);
  const [uncontrolledCardOpen, setUncontrolledCardOpen] = useState(true);
  const cardOpen = onCardExpandedChange ? cardExpanded : uncontrolledCardOpen;
  const setCardOpen = (next: boolean) => {
    if (onCardExpandedChange) onCardExpandedChange(next);
    else setUncontrolledCardOpen(next);
  };

  const decoded = decodeCommonEntities(text);
  const preview = decoded.slice(0, 280);
  const isLong = decoded.length > 280;

  return (
    <Card>
      <CardHeader
        title="Full job description"
        action={
          <div className="flex items-center gap-1">
            {isLong && cardOpen ? (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={textOpen}
                onClick={() => setTextOpen((o) => !o)}
              >
                {textOpen ? "Collapse" : "View Full Description"}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => setCardOpen(!cardOpen)}
              aria-expanded={cardOpen}
              aria-label={
                cardOpen ? "Collapse full job description" : "Expand full job description"
              }
              title={
                cardOpen ? "Collapse full job description" : "Expand full job description"
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <ChevronDownIcon
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  cardOpen ? "rotate-0" : "-rotate-90"
                )}
              />
            </button>
          </div>
        }
      />
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          cardOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <CardBody>
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
              {textOpen ? decoded : preview + (isLong ? "…" : "")}
            </p>
          </CardBody>
        </div>
      </div>
    </Card>
  );
}
