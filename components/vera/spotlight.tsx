"use client";

import { cn } from "@/lib/utils";

/**
 * Mode 2 plumbing (DESIGN.md v3 "The two modes").
 *
 * Text-first is mode 1 and is what ships today. When ElevenLabs lands, Vera's
 * narration sets `spotlight` to the id of the thing she is talking about; that
 * element comes forward and everything around it recedes. Nothing in the result
 * view hard-codes its own prominence, so wiring the voice track later is a
 * matter of setting one string — no layout change.
 *
 * `spotlight === null` is the neutral, everything-legible state.
 */

export type SpotlightTarget = string | null;

export const SPOT = {
  headline: "headline",
  chart: "chart",
  insights: "insights",
  source: "source",
} as const;

export function Spot({
  id,
  spotlight,
  className,
  children,
}: {
  id: string;
  spotlight: SpotlightTarget;
  className?: string;
  children: React.ReactNode;
}) {
  const promoted = spotlight === id;
  const receded = spotlight !== null && spotlight !== id;

  return (
    <div
      data-spot={id}
      data-spot-state={promoted ? "promoted" : receded ? "receded" : "neutral"}
      aria-hidden={receded || undefined}
      className={cn(
        "origin-center transition-[opacity,transform,filter] duration-[420ms] [transition-timing-function:var(--ease-settle)] motion-reduce:transition-none",
        receded && "pointer-events-none scale-[0.99] opacity-15 blur-[1.5px] motion-reduce:blur-none",
        promoted && "scale-[1.015] motion-reduce:scale-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
