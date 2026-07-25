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
import { initLogger, type Logger } from "braintrust";
import { MOCK_MODE } from "@/lib/config";
import type { Finding } from "@/lib/types";

/*
 * Must match the name in `instrumentation.ts`. Two different names would mean
 * two `initLogger` calls fighting over the SDK's global logger, and traces
 * landing in whichever project initialised last.
 */
const PROJECT_NAME = "My Project";

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

export interface AnalysisTrace {
  question: string;
  datasetId: string;
  finding: Finding | null;
  /** Set when the run failed before producing a finding. */
  error?: string;
  durationMs: number;
}

/**
 * Records one analysis as a Braintrust log event. Fire-and-forget: the caller
 * must never await correctness of telemetry, and never surface its failure.
 */
export function logAnalysis(trace: AnalysisTrace): void {
  const active = getLogger();
  if (!active) return;

  const { finding } = trace;

  try {
    active.log({
      input: { question: trace.question, dataset: trace.datasetId },
      // `Finding` is a discriminated union on purpose (PRD §6): a value exists
      // only on the verified branch, so the trace can never carry a figure that
      // was never verified.
      output:
        finding === null
          ? { verdict: "failed", error: trace.error ?? "Analysis produced no finding." }
          : finding.verdict === "verified"
            ? {
                verdict: "verified",
                value: finding.value,
                unit: finding.unit,
                claim: finding.claim,
                code: finding.code.source,
              }
            : { verdict: "unverified", reason: finding.reason, detail: finding.detail },
      metadata: {
        // Everything a judge would ask to see, without re-reading the transcript.
        verdict: finding?.verdict ?? "failed",
        durationMs: trace.durationMs,
        attempts: finding?.attempts ?? null,
        exitCode: finding?.verdict === "verified" ? finding.execution.exitCode : null,
        executionMs: finding?.verdict === "verified" ? finding.execution.durationMs : null,
        columns: finding?.verdict === "verified" ? finding.grounding.columns : [],
        groundedRows: finding?.verdict === "verified" ? finding.grounding.rowCount : null,
      },
    });
    // Flush is best-effort; a failed flush must not fail the request.
    void active.flush().catch(() => {});
  } catch {
    // Telemetry is never load-bearing.
  }
}
