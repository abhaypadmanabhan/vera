"use client";

import { useCallback, useRef, useState } from "react";
import { readEventStream } from "@/lib/stream";
import { STAGE_ORDER } from "@/lib/types";
import type { CsvPayload, Finding, StageId, StageStatus } from "@/lib/types";

/**
 * The client half of the run. Owns the SSE connection and folds `StageEvent`s
 * into render-ready state. UI components stay presentational — they receive
 * `StageView[]` and `Finding` as props.
 */

export interface StageView {
  id: StageId;
  status: StageStatus;
  detail: string;
  attempt: number;
  /** ms since run start when this stage last changed. */
  elapsedMs: number;
}

export interface AnalysisState {
  stages: StageView[];
  finding: Finding | null;
  error: string | null;
  isRunning: boolean;
}

const initialStages = (): StageView[] =>
  STAGE_ORDER.map((id) => ({
    id,
    status: "pending" as StageStatus,
    detail: "",
    attempt: 1,
    elapsedMs: 0,
  }));

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    stages: initialStages(),
    finding: null,
    error: null,
    isRunning: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ stages: initialStages(), finding: null, error: null, isRunning: false });
  }, []);

  const start = useCallback(async (question: string, csv: CsvPayload) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ stages: initialStages(), finding: null, error: null, isRunning: true });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, csv }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const message = await response.text().catch(() => "Request failed");
        setState((s) => ({ ...s, isRunning: false, error: message || "Request failed" }));
        return;
      }

      for await (const event of readEventStream(response.body)) {
        if (event.type === "stage") {
          setState((s) => ({
            ...s,
            stages: s.stages.map((stage) =>
              stage.id === event.stage
                ? {
                    id: stage.id,
                    status: event.status,
                    detail: event.detail,
                    attempt: event.attempt,
                    elapsedMs: event.elapsedMs,
                  }
                : stage,
            ),
          }));
        } else if (event.type === "finding") {
          setState((s) => ({ ...s, finding: event.finding, isRunning: false }));
        } else {
          setState((s) => ({ ...s, error: event.message, isRunning: false }));
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((s) => ({
        ...s,
        isRunning: false,
        error: error instanceof Error ? error.message : "Something went wrong",
      }));
    } finally {
      setState((s) => (s.isRunning ? { ...s, isRunning: false } : s));
    }
  }, []);

  return { ...state, start, reset } as const;
}
