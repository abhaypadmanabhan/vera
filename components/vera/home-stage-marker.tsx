"use client";

import { Check, X } from "lucide-react";
import type { StageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One mark, four states, shared by the run timeline and the prep timeline.
 *
 * Form carries the state, colour carries the urgency (UI-UX vault, "AI Design
 * Tells"): a row of green/amber/grey dots reads as decoration wearing a
 * semantic costume, because nothing about a green circle means finished. So
 * `pending` is a hollow ring (present, empty), `complete` is a hairline check in
 * plain ink (a done thing recedes), and only the two states that want the eye
 * carry colour — `active` and `failed`.
 *
 * `active` is a level meter: three bars breathing out of phase, because the
 * stage is *doing* something. It is not a spinner — nothing rotates and nothing
 * implies progress it cannot measure — and `prefers-reduced-motion` flattens it
 * to three solid bars that still read as "this is the one running"
 * (globals.css kills `.v-breathe` outright).
 */
export function StageMarker({
  status,
  compact = false,
}: {
  status: StageStatus;
  /** The 16px mark, for the prep sequence in the narrow column. */
  compact?: boolean;
}) {
  const box = compact ? "size-4" : "size-5";

  if (status === "complete") {
    return (
      <span className={cn("grid place-items-center", box)}>
        <Check
          className={cn("text-ink-muted", compact ? "size-3" : "size-3.5")}
          strokeWidth={2}
          aria-hidden
        />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className={cn("grid place-items-center", box)}>
        <X
          className={cn("text-danger", compact ? "size-3" : "size-3.5")}
          strokeWidth={2}
          aria-hidden
        />
      </span>
    );
  }

  if (status === "active") {
    const bars = compact ? ["h-1.5", "h-2.5", "h-1.5"] : ["h-2", "h-3", "h-2"];
    return (
      <span className={cn("flex items-center justify-center gap-[2px]", box)} aria-hidden>
        {bars.map((height, index) => (
          <span
            key={index}
            className={cn("v-breathe w-[2px] rounded-full bg-accent", height)}
            style={{ animationDelay: `${index * -0.6}s` }}
          />
        ))}
      </span>
    );
  }

  return (
    <span className={cn("grid place-items-center", box)} aria-hidden>
      <span
        className={cn("rounded-full border border-line-strong", compact ? "size-2" : "size-2.5")}
      />
    </span>
  );
}
