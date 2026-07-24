"use client";

import { useState } from "react";
import type { StageView } from "@/hooks/use-analysis";
import { STAGE_ORDER } from "@/lib/types";
import type { StageId } from "@/lib/types";

/**
 * `useAnalysis` keeps only the newest event per stage, which is the right shape
 * for rendering "where are we now". The timeline also has to show where we have
 * *been*: a failed attempt has to stay on screen after the stage re-enters
 * `active` for attempt 2, or the retry flashes past and reads as a glitch
 * (issue #5).
 *
 * This is the run's ledger. It appends, never rewrites, and every entry in it
 * came from a `StageEvent` — nothing here is inferred or timed client-side.
 *
 * The fold runs during render and adjusts state in place, which is React's
 * documented way to derive state from changing props. It is idempotent: folding
 * the same `stages` in twice is a no-op, so a discarded render costs nothing.
 */

export interface FailedAttempt {
  key: string;
  stage: StageId;
  attempt: number;
  detail: string;
  elapsedMs: number;
}

export interface StageTiming {
  /** Run-relative ms at which this stage last went active, per events. */
  startedAt: number | null;
  /** Filled in once the stage completed or failed. */
  durationMs: number | null;
  attempt: number;
}

interface Ledger {
  runId: number;
  failures: FailedAttempt[];
  timings: Record<StageId, StageTiming>;
}

function emptyLedger(runId: number): Ledger {
  return {
    runId,
    failures: [],
    timings: Object.fromEntries(
      STAGE_ORDER.map((id) => [id, { startedAt: null, durationMs: null, attempt: 1 }]),
    ) as Record<StageId, StageTiming>,
  };
}

function fold(previous: Ledger, stages: StageView[], runId: number): Ledger {
  const base = previous.runId === runId ? previous : emptyLedger(runId);
  let changed = base !== previous;

  const failures = [...base.failures];
  const timings = { ...base.timings };

  for (const stage of stages) {
    const known = timings[stage.id];

    if (stage.status === "active") {
      if (known.startedAt === null || known.attempt !== stage.attempt) {
        timings[stage.id] = {
          startedAt: stage.elapsedMs,
          durationMs: null,
          attempt: stage.attempt,
        };
        changed = true;
      }
    } else if (stage.status === "complete" || stage.status === "failed") {
      const startedAt = known.attempt === stage.attempt ? known.startedAt : null;
      const durationMs = startedAt === null ? null : Math.max(stage.elapsedMs - startedAt, 0);
      if (known.durationMs !== durationMs || known.attempt !== stage.attempt) {
        timings[stage.id] = { startedAt, durationMs, attempt: stage.attempt };
        changed = true;
      }
    }

    if (stage.status === "failed") {
      const key = `${stage.id}:${stage.attempt}`;
      if (!failures.some((failure) => failure.key === key)) {
        failures.push({
          key,
          stage: stage.id,
          attempt: stage.attempt,
          detail: stage.detail,
          elapsedMs: stage.elapsedMs,
        });
        changed = true;
      }
    }
  }

  return changed ? { runId, failures, timings } : previous;
}

export function useStageLedger(stages: StageView[], runId: number) {
  const [ledger, setLedger] = useState<Ledger>(() => emptyLedger(runId));

  const next = fold(ledger, stages, runId);
  if (next !== ledger) setLedger(next);

  const maxAttempt = stages.reduce((highest, stage) => Math.max(highest, stage.attempt), 1);

  return { failures: next.failures, timings: next.timings, maxAttempt } as const;
}
