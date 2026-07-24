"use client";

import { formatDuration } from "./format";
import { useRunClock } from "./use-run-clock";
import { useStageLedger } from "./use-stage-ledger";
import type { StageView } from "@/hooks/use-analysis";
import { STAGE_LABELS } from "@/lib/types";
import type { StageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The margin rail: the live reasoning trace set as marginalia, running down the
 * left of the document like a court reporter's log. It replaces the old "card of
 * four steps" entirely.
 *
 * Two rules it exists to keep:
 *   - never silent — every stage carries a live detail line (PRD §7)
 *   - never revisionist — a failed attempt stays on the page, struck through,
 *     when the retry starts (the retry is the product working, not a glitch)
 *
 * Stage state comes only from server events. Nothing here advances a stage.
 */

function Mark({ status }: { status: StageStatus }) {
  if (status === "failed") {
    return (
      <span aria-hidden className="font-mono text-note leading-5 text-mark">
        ×
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 block size-[7px] rounded-full border",
        status === "active" && "v-live border-mark bg-mark",
        status === "complete" && "border-ink bg-ink",
        status === "pending" && "border-rule bg-transparent",
      )}
    />
  );
}

export function MarginRail({
  stages,
  isRunning,
  runId,
  startedAt,
  settled,
}: {
  stages: StageView[];
  isRunning: boolean;
  runId: number;
  /** `Date.now()` when this run was submitted, 0 before the first run. */
  startedAt: number;
  /** True once a finding or an error has been filed. */
  settled: boolean;
}) {
  const { failures, timings } = useStageLedger(stages, runId);
  const elapsed = useRunClock(isRunning, startedAt);

  const started = startedAt > 0;
  const current = stages.find((stage) => stage.status === "active");
  const heading = isRunning ? "Running" : settled ? "Run complete" : "No run on the record";

  return (
    <aside className="lg:sticky lg:top-10">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2 lg:block lg:space-y-1">
        <h2 className="v-label text-ink">Audit trail</h2>
        <p className="v-label">
          {heading}
          {started ? <span className="v-nums"> · {formatDuration(elapsed)}</span> : null}
        </p>
      </div>

      <p aria-live="polite" className="sr-only">
        {current ? `${STAGE_LABELS[current.id]}. ${current.detail}` : ""}
      </p>

      <ol className="mt-4 space-y-5">
        {stages.map((stage) => {
          const timing = timings[stage.id];
          const touched = stage.status !== "pending";
          const stageFailures = failures.filter(
            (failure) => failure.stage === stage.id && failure.attempt < stage.attempt,
          );

          return (
            <li key={stage.id} className="grid grid-cols-[0.75rem_1fr] gap-x-2.5">
              <Mark status={stage.status} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cn(
                      "v-nums font-mono text-note",
                      touched ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {touched ? formatDuration(stage.elapsedMs) : "—"}
                  </span>
                  <span className={cn("v-label", touched && "text-ink")}>
                    {STAGE_LABELS[stage.id]}
                  </span>
                  {stage.attempt > 1 ? (
                    <span className="v-label text-mark-ink">Attempt {stage.attempt}</span>
                  ) : null}
                </p>

                {stageFailures.map((failure) => (
                  <p
                    key={failure.key}
                    className="mt-1 font-mono text-note text-mark-ink line-through decoration-mark/70"
                  >
                    Attempt {failure.attempt} — {failure.detail}
                  </p>
                ))}

                <p className="mt-1 font-mono text-note text-ink-muted">
                  {stage.detail || (touched ? "—" : "Waiting")}
                  {timing.durationMs !== null && stage.status !== "active" ? (
                    <span className="v-nums"> · took {formatDuration(timing.durationMs)}</span>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
