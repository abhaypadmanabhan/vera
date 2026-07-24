"use client";

import { AlertTriangle, Check, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Panel, SectionLabel } from "./panel";
import { formatDuration } from "./format";
import { useRunClock } from "./use-run-clock";
import { useStageLedger } from "./use-stage-ledger";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/types";
import type { StageId, StageStatus } from "@/lib/types";
import type { StageView } from "@/hooks/use-analysis";

/** PRD §7: two attempts, then Vera stops and says so. */
const MAX_ATTEMPTS = 2;

/**
 * A stage is never allowed to sit there saying nothing — silence reads as a
 * hang. When the stream hasn't sent a detail yet, these stand in.
 */
const FALLBACK_DETAIL: Record<StageId, Record<StageStatus, string>> = {
  writing_code: {
    pending: "Waiting on a question",
    active: "Drafting pandas against the schema",
    complete: "Code ready",
    failed: "Could not draft runnable code",
  },
  running_sandbox: {
    pending: "Sandbox stays warm between runs",
    active: "Executing in an isolated sandbox",
    complete: "Execution finished",
    failed: "Execution failed",
  },
  verifying: {
    pending: "Nothing to trace yet",
    active: "Matching the result to source cells",
    complete: "Traced to source cells",
    failed: "No value to trace",
  },
  done: {
    pending: "No answer yet",
    active: "Assembling the finding",
    complete: "Finding ready",
    failed: "Run stopped without an answer",
  },
};

function StageMarker({ status }: { status: StageStatus }) {
  if (status === "complete") {
    return (
      <span className="relative flex size-6 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary">
        <Check className="size-3.5 text-primary" aria-hidden />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="relative flex size-6 items-center justify-center rounded-full bg-warning/15 ring-1 ring-warning">
        <AlertTriangle className="size-3 text-warning" aria-hidden />
      </span>
    );
  }

  if (status === "active") {
    return (
      <span className="relative flex size-6 items-center justify-center rounded-full ring-2 ring-primary">
        <span aria-hidden className="vera-pulse absolute inset-0 rounded-full bg-primary/25" />
        <span className="size-2 rounded-full bg-primary" />
      </span>
    );
  }

  return <span className="flex size-6 rounded-full ring-1 ring-border" />;
}

export function StageTimeline({
  stages,
  isRunning,
  runId,
  startedAt,
}: {
  stages: StageView[];
  isRunning: boolean;
  /** Bumped once per run so the ledger knows when to start a fresh page. */
  runId: number;
  /** `Date.now()` at submit, or 0 before the first run. */
  startedAt: number;
}) {
  const { failures, timings, maxAttempt } = useStageLedger(stages, runId);
  const runElapsedMs = useRunClock(isRunning, startedAt);

  const activeStage = stages.find((stage) => stage.status === "active");
  const announced = activeStage ?? [...stages].reverse().find((stage) => stage.status !== "pending");

  return (
    <Panel>
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <SectionLabel icon={<Activity className="size-3.5" aria-hidden />}>
          Reasoning trace
        </SectionLabel>
        <span className="flex items-center gap-2">
          {maxAttempt > 1 ? (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
              Retry · attempt {maxAttempt} of {MAX_ATTEMPTS}
            </Badge>
          ) : null}
          <span
            className={cn(
              "vera-nums text-xs",
              isRunning ? "text-primary" : "text-muted-foreground",
            )}
          >
            {formatDuration(runElapsedMs)}
          </span>
        </span>
      </CardHeader>

      <CardContent>
        <p aria-live="polite" className="sr-only">
          {announced
            ? `${STAGE_LABELS[announced.id]}: ${announced.status}. ${
                announced.detail || FALLBACK_DETAIL[announced.id][announced.status]
              }`
            : "Idle. No analysis running."}
        </p>

        <ol className="space-y-0">
          {stages.map((stage, index) => {
            const timing = timings[stage.id];
            const isLast = index === stages.length - 1;
            const stageFailures = failures.filter(
              (failure) => failure.stage === stage.id && failure.attempt !== stage.attempt,
            );

            // `done` is a marker, not a step — it never goes active, so it
            // reports the run total instead of a duration of its own.
            const timer =
              stage.status === "active" && timing.startedAt !== null
                ? formatDuration(Math.max(runElapsedMs - timing.startedAt, 0))
                : timing.durationMs !== null && timing.durationMs > 0
                  ? formatDuration(timing.durationMs)
                  : stage.id === "done" && stage.status === "complete"
                    ? formatDuration(stage.elapsedMs)
                    : null;

            return (
              <li
                key={stage.id}
                className={cn("relative grid grid-cols-[auto_1fr_auto] gap-x-3", !isLast && "pb-5")}
              >
                {!isLast ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-7 bottom-1 left-[0.6875rem] w-px transition-colors duration-250",
                      stage.status === "complete"
                        ? "bg-primary/40"
                        : stage.status === "failed"
                          ? "bg-warning/40"
                          : "bg-border",
                    )}
                  />
                ) : null}

                <StageMarker status={stage.status} />

                <div className="min-w-0 pt-0.5">
                  <p
                    className={cn(
                      "text-sm font-medium transition-colors duration-150",
                      stage.status === "pending" && "text-muted-foreground",
                      stage.status === "active" && "text-foreground",
                      stage.status === "complete" && "text-foreground",
                      stage.status === "failed" && "text-warning",
                    )}
                  >
                    {STAGE_LABELS[stage.id]}
                    {stage.attempt > 1 ? (
                      <span className="vera-nums ml-2 font-normal text-warning">
                        attempt {stage.attempt}
                      </span>
                    ) : null}
                  </p>

                  {stageFailures.map((failure) => (
                    <p
                      key={failure.key}
                      className="mt-1 truncate text-xs text-warning/70 line-through"
                      title={failure.detail}
                    >
                      Attempt {failure.attempt}: {failure.detail}
                    </p>
                  ))}

                  <p
                    key={`${stage.id}-${stage.status}-${stage.attempt}-${stage.detail}`}
                    className="vera-enter mt-1 truncate text-xs text-muted-foreground"
                    title={stage.detail || FALLBACK_DETAIL[stage.id][stage.status]}
                  >
                    {stage.detail || FALLBACK_DETAIL[stage.id][stage.status]}
                  </p>
                </div>

                <span
                  className={cn(
                    "vera-nums pt-0.5 text-xs tabular-nums",
                    stage.status === "active" ? "text-primary" : "text-muted-foreground/70",
                  )}
                >
                  {timer ?? "—"}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Panel>
  );
}
