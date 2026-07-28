"use client";

import type { StageView } from "@/hooks/use-analysis";
import { STAGE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDuration } from "./format";
import { StageMarker } from "./home-stage-marker";
import { useRunClock } from "./use-run-clock";

const STAGE_VENDOR: Partial<Record<StageView["id"], string>> = {
  writing_code: "Fireworks",
  running_sandbox: "Daytona",
};

/**
 * What a stage is *for*, shown only until the stream sends that stage's own
 * detail line. It describes the pipeline, never the file: no count, no column,
 * no result. So a stage that has not run yet still reads as part of a sequence
 * rather than as an empty row, and nothing on screen can be mistaken for a
 * finding (PRD §6 — a number appears only once a run is verified).
 */
const STAGE_PREVIEW: Record<StageView["id"], string> = {
  writing_code: "Turning your question into analysis code.",
  running_sandbox: "Running that code against the real file.",
  verifying: "Tracing the result back to the cells it came from.",
  done: "Only a traced number is shown.",
};

/**
 * Screen 2 — Working. The four stages as a quiet, intentional sequence
 * (DESIGN.md "Screen 2"). One active at a time, each carrying a live detail line
 * and its elapsed time so the screen is never silent. No spinner, ever.
 *
 * The geometry is fixed from the first frame: every stage reserves the same
 * two-line detail slot whether or not it has anything to say yet, and the
 * elapsed column has a fixed width. So a stage settling in place, or a detail
 * line growing from four words to twelve, changes text and never layout —
 * nothing below it jumps while this is on stage.
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
  const failed = stages.find((stage) => stage.status === "failed");
  const attempt = Math.max(...stages.map((stage) => stage.attempt));

  return (
    <div className="mx-auto my-auto w-full max-w-2xl px-6 py-10 pb-24">
      <p className="v-label v-reveal" style={{ ["--step" as string]: 0 }}>
        Your question
      </p>
      <h1
        className="v-reveal mt-2 text-lead text-balance text-ink"
        style={{ ["--step" as string]: 1 }}
      >
        {question}
      </h1>

      <ol className="v-reveal mt-8 border-b border-line" style={{ ["--step" as string]: 2 }}>
        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} />
        ))}
      </ol>

      <div className="mt-4 flex items-baseline gap-4">
        <span className="v-nums shrink-0 font-mono text-micro text-ink">
          {formatDuration(elapsed)}
        </span>
        <span className="ml-auto text-right text-small text-ink-muted">
          {attempt > 1 && (
            <span className={cn(failed ? "text-danger" : "text-ink")}>Attempt {attempt} · </span>
          )}
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

function StageRow({ stage }: { stage: StageView }) {
  const pending = stage.status === "pending";
  const vendor = STAGE_VENDOR[stage.id];

  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.25rem] items-start gap-x-4 border-t border-line py-4">
      <span className="flex justify-center pt-1">
        <StageMarker status={stage.status} />
      </span>

      <div>
        {/*
         * A stage that has not been reached recedes by weight and colour, never
         * by opacity — a faded row is a contrast failure, not a hierarchy.
         */}
        <p className="flex flex-wrap items-baseline gap-x-2.5 text-body">
          <span
            className={cn(
              stage.status === "active" && "font-medium text-ink",
              stage.status === "complete" && "text-ink",
              stage.status === "failed" && "text-ink",
              pending && "text-ink-muted",
            )}
          >
            {STAGE_LABELS[stage.id]}
          </span>
          {vendor && <span className="text-small text-ink-muted">{vendor}</span>}
          {stage.attempt > 1 && (
            <span
              className={`text-small ${
                stage.status === "failed" ? "text-danger" : "text-ink-muted"
              }`}
            >
              {vendor ? "· " : ""}
              Attempt {stage.attempt}
            </span>
          )}
        </p>
        {/*
         * Reserved whether or not the stream has said anything yet: two lines of
         * 15px text, on every stage. This is what keeps the sequence from
         * jumping as details arrive and change length.
         *
         * NOT `cn()`: tailwind-merge does not know this design system's tokens,
         * so it reads `text-small` and `text-danger` as the same group and drops
         * the size. Never put a size token and a colour token through `cn`.
         */}
        <p
          className={`mt-1 min-h-[2.8125rem] text-small ${
            stage.status === "failed" ? "text-danger" : "text-ink-muted"
          }`}
        >
          {stage.detail || STAGE_PREVIEW[stage.id]}
        </p>
      </div>

      <span className="v-nums pt-1.5 text-right font-mono text-micro text-ink-muted">
        {pending ? "" : formatDuration(stage.elapsedMs)}
      </span>
    </li>
  );
}
