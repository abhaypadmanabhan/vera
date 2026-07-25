/*
 * Braintrust *Logs* — the live trace of what actually happened on stage.
 *
 * This is a different surface from the benchmark. `scripts/eval/vera.eval.ts`
 * writes an **experiment**: a fixed question set, scored offline against an
 * answer key, once. That is where the 100% vs 47.6% comes from. It never
 * touches Logs, which is why the Logs tab was empty.
 *
 * This module fills the other half: every real question asked of the running
 * app becomes a searchable trace — the question, the verdict, the figure, the
 * code that ran, the columns it read, and how long each of it took.
 *
 * HONESTY (PRD §6): a trace here proves the run happened and is inspectable.
 * It scores nothing and asserts nothing about correctness. Do not let the
 * presence of a log be read as the benchmark.
 *
 * MONEY / MOCK: no key, or mock mode, means no logger and no network. The app
 * must keep running with zero keys forever, so every call here is a no-op when
 * Braintrust is not configured. A logging failure must never fail an analysis.
 */
import { initLogger, withCurrent, type Logger, type Span } from "braintrust";
import { MOCK_MODE } from "@/lib/config";
import type { Finding } from "@/lib/types";

const PROJECT_NAME = "Vera Accuracy Benchmark";
const FLUSH_TIMEOUT_MS = 2_000;

let logger: Logger<false> | null | undefined;

/** One process-wide logger, created lazily. `null` means "not configured". */
function getLogger(): Logger<false> | null {
  if (logger !== undefined) return logger;

  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (MOCK_MODE || !apiKey) {
    logger = null;
    return logger;
  }

  try {
    // asyncFlush: false — a serverless-style request can end before a background
    // flush lands, and a dropped trace is worse than a few ms on the response.
    logger = initLogger({ projectName: PROJECT_NAME, apiKey, asyncFlush: false });
  } catch {
    logger = null;
  }
  return logger;
}

/** Initializes the same cached logger used by request traces. */
export function initializeBraintrust(): void {
  getLogger();
}

export interface AnalysisTraceResult {
  finding: Finding | null;
  /** Set when the run failed before producing a finding. */
  error?: string;
  durationMs: number;
}

export interface AnalysisTrace {
  run<Result>(callback: () => Result): Result;
  finish(result: AnalysisTraceResult): Promise<void>;
}

interface AnalysisTraceInput {
  question: string;
  datasetId: string;
}

function analysisOutput(result: AnalysisTraceResult): object {
  const { finding } = result;
  return finding === null
    ? { verdict: "failed", error: result.error ?? "Analysis produced no finding." }
    : finding.verdict === "verified"
      ? {
          verdict: "verified",
          value: finding.value,
          unit: finding.unit,
          claim: finding.claim,
          code: finding.code.source,
        }
      : { verdict: "unverified", reason: finding.reason, detail: finding.detail };
}

function analysisMetadata(result: AnalysisTraceResult): Record<string, unknown> {
  const { finding } = result;
  return {
    verdict: finding?.verdict ?? "failed",
    durationMs: result.durationMs,
    attempts: finding?.attempts ?? null,
    exitCode: finding?.verdict === "verified" ? finding.execution.exitCode : null,
    executionMs:
      finding?.verdict === "verified" ? finding.execution.durationMs : null,
    columns: finding?.verdict === "verified" ? finding.grounding.columns : [],
    groundedRows:
      finding?.verdict === "verified" ? finding.grounding.rowCount : null,
  };
}

function noopTrace(): AnalysisTrace {
  return {
    run: (callback) => callback(),
    finish: async () => undefined,
  };
}

/**
 * Opens the analysis root before any model or sandbox work begins. Each
 * `run()` call restores that root as the active async context, which makes the
 * manual Fireworks `traced()` call a child even though the response is streamed
 * over several `ReadableStream.pull()` callbacks.
 */
export function beginAnalysisTrace(input: AnalysisTraceInput): AnalysisTrace {
  const active = getLogger();
  if (!active) return noopTrace();

  let span: Span;
  try {
    span = active.startSpan({
      name: "analysis",
      type: "task",
      event: {
        input: { question: input.question, dataset: input.datasetId },
      },
    });
  } catch {
    return noopTrace();
  }

  let finished = false;
  return {
    run(callback) {
      let callbackStarted = false;
      let callbackCompleted = false;
      let callbackResult!: ReturnType<typeof callback>;
      try {
        return withCurrent(
          span,
          () => {
            callbackStarted = true;
            callbackResult = callback();
            callbackCompleted = true;
            return callbackResult;
          },
          active.loggingState,
        );
      } catch (error) {
        if (callbackCompleted) return callbackResult;
        if (callbackStarted) throw error;
        return callback();
      }
    },
    async finish(result) {
      if (finished) return;
      finished = true;

      // `Finding` is a discriminated union (PRD §6), so a figure can only
      // appear on the verified branch. Every telemetry operation is isolated.
      try {
        span.log({
          output: analysisOutput(result),
          metadata: analysisMetadata(result),
        });
      } catch {
        // Telemetry is never load-bearing.
      }
      try {
        span.end();
      } catch {
        // Telemetry is never load-bearing.
      }
      let flushTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          span.flush(),
          new Promise<void>((resolve) => {
            flushTimeout = setTimeout(resolve, FLUSH_TIMEOUT_MS);
          }),
        ]);
      } catch {
        // Telemetry is never load-bearing.
      } finally {
        if (flushTimeout) clearTimeout(flushTimeout);
      }
    },
  };
}
