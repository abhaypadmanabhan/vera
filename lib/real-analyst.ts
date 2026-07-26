import { reconcileClaim } from "./claim";
import { csvSchema } from "./csv";
import { generatePandasCode } from "./codegen/generate";
import { runCodegenWithRetries } from "./codegen/retry";
import {
  SANDBOX_CSV_PATH,
  daytonaExecutor,
  ensureDatasetLoaded,
  getWarmSandbox,
  readSandboxFile,
} from "./daytona/sandbox";
import { verifyContextFigures, verifyGrounding } from "./verify";
import type { AnalysisRequest, Analyst, StageEvent } from "./types";

/**
 * The real orchestrator: Fireworks writes the code, Daytona runs it, the
 * safeguard decides whether the number is allowed out (PRD §3).
 *
 * It implements the same `Analyst` interface as the mock, so the UI, the route
 * and the client hook are unchanged.
 */
export const realAnalyst: Analyst = {
  async *run(request: AnalysisRequest): AsyncIterable<StageEvent> {
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;
    const { dataset } = request;
    let analysisDataset = dataset;
    let sandboxPath = SANDBOX_CSV_PATH;

    yield {
      type: "stage",
      stage: "writing_code",
      status: "active",
      detail: "Warming the sandbox",
      attempt: 1,
      elapsedMs: elapsed(),
    };

    try {
      const warm = await getWarmSandbox();
      const load = await ensureDatasetLoaded(dataset.id, dataset.content);
      yield {
        type: "stage",
        stage: "writing_code",
        status: "active",
        detail: warm.reused
          ? `Sandbox reused (warm) · ${load.uploaded ? "uploaded" : "file already in place"}`
          : `Sandbox created in ${(warm.readyMs / 1000).toFixed(1)}s · uploaded ${(
              load.bytes / 1_000_000
            ).toFixed(1)} MB`,
        attempt: 1,
        elapsedMs: elapsed(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sandbox unavailable.";
      yield {
        type: "stage",
        stage: "running_sandbox",
        status: "failed",
        detail: message,
        attempt: 1,
        elapsedMs: elapsed(),
      };
      yield {
        type: "finding",
        finding: {
          verdict: "unverified",
          reason: "upstream_error",
          detail: message,
          code: null,
          attempts: 1,
        },
        elapsedMs: elapsed(),
      };
      return;
    }

    if (request.analysisPath && request.analysisProfile) {
      try {
        analysisDataset = {
          ...dataset,
          content: await readSandboxFile(request.analysisPath),
          profile: request.analysisProfile,
        };
        sandboxPath = request.analysisPath;
      } catch {
        // Prepared artifacts are opportunistic. If one has gone stale, the
        // question still runs against the original file and original profile.
      }
    }

    const schema = csvSchema(analysisDataset.content, 3);
    const loop = runCodegenWithRetries({
      question: request.question,
      profile: analysisDataset.profile,
      sampleRows: schema.sampleRows,
      sandboxPath,
      generator: {
        generate: (req) => generatePandasCode(req, { mockMode: false }),
      },
      executor: daytonaExecutor,
    });

    // Forward every stage event the loop emits; it also emits the terminal
    // `unverified` finding on its own failure paths.
    let outcome: Awaited<ReturnType<typeof loop.next>>;
    while (!(outcome = await loop.next()).done) {
      yield outcome.value;
    }
    const result = outcome.value;
    if (!result) return;

    yield {
      type: "stage",
      stage: "verifying",
      status: "active",
      detail: `Tracing ${String(result.execution.value)} back to source cells`,
      attempt: result.attempts,
      elapsedMs: elapsed(),
    };

    const verdict = verifyGrounding({
      execution: result.execution,
      columnsUsed: result.columnsUsed,
      profile: analysisDataset.profile,
      csvContent: analysisDataset.content,
    });

    if (!verdict.ok) {
      yield {
        type: "stage",
        stage: "verifying",
        status: "failed",
        detail: verdict.detail,
        attempt: result.attempts,
        elapsedMs: elapsed(),
      };
      yield {
        type: "finding",
        finding: {
          verdict: "unverified",
          reason: verdict.reason,
          detail: verdict.detail,
          code: result.code,
          attempts: result.attempts,
        },
        elapsedMs: elapsed(),
      };
      return;
    }

    yield {
      type: "stage",
      stage: "verifying",
      status: "complete",
      detail: `Grounded in ${verdict.grounding.columns.join(", ")} across ${verdict.grounding.rowCount.toLocaleString()} rows`,
      attempt: result.attempts,
      elapsedMs: elapsed(),
    };
    yield {
      type: "stage",
      stage: "done",
      status: "complete",
      detail: "Verified",
      attempt: result.attempts,
      elapsedMs: elapsed(),
    };
    yield {
      type: "finding",
      finding: {
        verdict: "verified",
        value: result.execution.value as number | string,
        unit: null,
        // Plain-English headline for the hero slide. The technical one-liner
        // (column names, date formats) belongs on the code slide, not here.
        //
        // The model writes this sentence BEFORE the code runs, so it is never
        // trusted to carry the figure — `reconcileClaim` places the executed
        // value and discards any sentence quoting a number the code did not
        // produce (PRD §6).
        claim: reconcileClaim({
          headline: result.headline,
          question: request.question,
          value: result.execution.value as number | string,
          fallback: result.code.explanation,
        }).claim,
        code: result.code,
        execution: result.execution,
        grounding: verdict.grounding,
        context: verifyContextFigures({
          declared: result.context,
          executed: result.execution.contextValues,
          profile: analysisDataset.profile,
        }),
        valence: result.valence,
        attempts: result.attempts,
      },
      elapsedMs: elapsed(),
    };
  },
};
