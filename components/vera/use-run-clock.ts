"use client";

import { useEffect, useState } from "react";

/**
 * The digits between events.
 *
 * Stage *state* comes only from `StageEvent`s — this hook never advances a
 * stage and never guesses one (issue #5: "never a fake client-side timer").
 * All it does is tick a readout of how long the current run has been going,
 * starting from the moment the submit handler fired.
 *
 * @param isRunning ticking stops the moment the stream ends, freezing the total
 * @param startedAt `Date.now()` captured when the run was submitted, or 0 for "no run yet"
 */
export function useRunClock(isRunning: boolean, startedAt: number): number {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [isRunning]);

  if (startedAt === 0) return 0;
  return Math.max(nowMs - startedAt, 0);
}
