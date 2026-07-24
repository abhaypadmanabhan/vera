"use client";

import { Check, X } from "lucide-react";
import type { StageView } from "@/hooks/use-analysis";
import { STAGE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDuration } from "./format";
import { useRunClock } from "./use-run-clock";

/**
 * Screen 2 — Working. The four stages as a quiet, intentional sequence
 * (DESIGN.md v3). One active at a time, each carrying a live detail line and the
 * elapsed time so the screen is never silent. Stages settle in place; nothing
 * pops, nothing spins. A failed attempt stays on screen and the retry is legible.
 *
 * Stage state comes only from the stream. Nothing here advances a stage on a
 * timer — the only clock is the readout of how long the run has been going.
 */
export function WorkingScreen({
  question,
  stages,
  isRunning,
  startedAt,
}: {
  question: string;
  stages: StageView[];
  isRunning: boolean;
  startedAt: number;
}) {
  const elapsed = useRunClock(isRunning, startedAt);
  const active = stages.find((stage) => stage.status === "active");
  const attempt = Math.max(...stages.map((stage) => stage.attempt));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 pb-24">
      <p className="v-label v-reveal" style={{ ["--step" as string]: 0 }}>
        Working
      </p>
      <h1
        className="v-reveal mt-3 text-lead font-medium text-balance text-ink"
        style={{ ["--step" as string]: 1 }}
      >
        {question}
      </h1>

      <ol className="v-reveal mt-10" style={{ ["--step" as string]: 2 }}>
        {stages.map((stage, index) => (
          <StageRow key={stage.id} stage={stage} isLast={index === stages.length - 1} />
        ))}
      </ol>

      <div className="mt-8 flex items-center gap-3 text-micro text-ink-muted">
        <span className="v-nums font-mono">{formatDuration(elapsed)}</span>
        <span className="h-px flex-1 bg-line" />
        <span>
          {attempt > 1 ? `Attempt ${attempt} · ` : ""}
          {isRunning ? "Vera is working" : "Run finished"}
        </span>
      </div>

      {/* Stage changes are announced, so the sequence is not visual-only. */}
      <p aria-live="polite" className="sr-only">
        {active ? `${STAGE_LABELS[active.id]}. ${active.detail}` : ""}
      </p>
    </div>
  );
}

function StageRow({ stage, isLast }: { stage: StageView; isLast: boolean }) {
  const pending = stage.status === "pending";

  return (
    <li className="grid grid-cols-[20px_1fr_auto] gap-x-4">
      <div className="relative flex justify-center pt-[7px]">
        <Marker status={stage.status} />
        {!isLast && (
          <span
            aria-hidden
            className="absolute top-[19px] bottom-[-7px] w-px bg-line"
            style={{ left: "calc(50% - 0.5px)" }}
          />
        )}
      </div>

      <div className={cn("pb-7 transition-opacity duration-300", pending && "opacity-40")}>
        <p
          className={cn(
            "text-body text-ink transition-[font-weight] duration-150",
            stage.status === "active" ? "font-medium" : "font-normal",
          )}
        >
          {STAGE_LABELS[stage.id]}
          {stage.attempt > 1 && (
            <span className="v-label ml-2 rounded-full border border-line px-2 py-0.5 align-middle">
              Attempt {stage.attempt}
            </span>
          )}
        </p>
        {stage.detail && (
          <p
            className={cn(
              "mt-1 text-small",
              stage.status === "failed" ? "text-danger" : "text-ink-muted",
            )}
          >
            {stage.detail}
          </p>
        )}
      </div>

      <span className={cn("v-nums pt-1 font-mono text-micro text-ink-muted", pending && "opacity-0")}>
        {formatDuration(stage.elapsedMs)}
      </span>
    </li>
  );
}

function Marker({ status }: { status: StageView["status"] }) {
  if (status === "complete") {
    return (
      <span className="grid size-[18px] place-items-center rounded-full bg-accent text-white">
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="grid size-[18px] place-items-center rounded-full bg-danger text-white">
        <X className="size-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="grid size-[18px] place-items-center">
        <span className="v-breathe size-2.5 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <span className="grid size-[18px] place-items-center">
      <span className="size-2.5 rounded-full border border-line-strong" />
    </span>
  );
}
