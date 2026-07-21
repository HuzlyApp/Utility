"use client";

import React from "react";

// Animated radial score ring. Accessible: exposes a readable text value and
// role=img with an aria-label. Does not rely on color alone.
export function MatchScoreRing({
  score,
  label,
  size = 132,
  stroke = 10,
  colorClass = "text-brand-600",
}: {
  score: number;
  label?: string;
  size?: number;
  stroke?: number;
  colorClass?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Match score ${clamped} percent${label ? `, ${label}` : ""}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={colorClass}
          style={{
            transition: "stroke-dashoffset 0.9s ease-out",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-slate-900" aria-hidden>
          {clamped}%
        </span>
        {label && (
          <span className="mt-0.5 text-xs font-medium text-slate-500" aria-hidden>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
