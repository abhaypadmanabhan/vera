import { LIMITS } from "../config";
import type {
  DatasetProfile,
  ExecutionResult,
  GeneratedCode,
  StageEvent,
} from "../types";
import type { CodegenOutput, CodegenRequest } from "./generate";

export interface CodeGenerator {
  generate(
    request: CodegenRequest & { attempt: number },
  ): Promise<CodegenOutput>;
}

export interface CodeExecutor {
  execute(request: {
    code: string;
    csvPath: string;
    timeoutMs: number;
    signal: AbortSignal;
  }): Promise<ExecutionResult>;
}

interface RetryOptions {
  question: string;
  profile: DatasetProfile;
  sampleRows: string[][];
  sandboxPath: string;
  generator: CodeGenerator;
  executor: CodeExecutor;
  maxRetries?: number;
  runBudgetMs?: number;
  executionTimeoutMs?: number;
  now?: () => number;
}

class BudgetExceededError extends Error {
  constructor() {
    super("The analysis exceeded its total wall-clock budget.");
    this.name = "BudgetExceededError";
  }
}

function toGeneratedCode(output: CodegenOutput): GeneratedCode {
  return {
    language: "python",
    source: output.code,
    explanation: output.explanation,
    lineCount: output.code.split("\n").length,
  };
}

async function withinBudget<T>(
  run: (signal: AbortSignal) => Promise<T>,
  remainingMs: number,
): Promise<T> {
  if (remainingMs <= 0) throw new BudgetExceededError();

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new BudgetExceededError());
    }, remainingMs);
  });

  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function* runCodegenWithRetries(
  options: RetryOptions,
): AsyncGenerator<StageEvent, ExecutionResult | null> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const requestedRetries = options.maxRetries ?? LIMITS.maxRetries;
  const maxAttempts =
    1 + Math.max(0, Math.min(requestedRetries, LIMITS.maxRetries));
  const runBudgetMs = options.runBudgetMs ?? LIMITS.runBudgetMs;
  const executionTimeoutMs =
    options.executionTimeoutMs ?? LIMITS.executionTimeoutMs;
  const elapsed = () => Math.max(0, now() - startedAt);
  const remaining = () => runBudgetMs - elapsed();
  let previousFailure: CodegenRequest["previousFailure"];
  let lastCode: GeneratedCode | null = null;

  const stage = (
    fields: Omit<Extract<StageEvent, { type: "stage" }>, "type" | "elapsedMs">,
  ): StageEvent => ({
    type: "stage",
    ...fields,
    elapsedMs: elapsed(),
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    yield stage({
      stage: "writing_code",
      status: "active",
      detail:
        attempt === 1
          ? "Generating pandas from the profiled schema"
          : `Attempt ${attempt} — fixing the previous execution error`,
      attempt,
    });

    let output: CodegenOutput;
    try {
      output = await withinBudget(
        (signal) =>
          options.generator.generate({
            question: options.question,
            profile: options.profile,
            sampleRows: options.sampleRows,
            sandboxPath: options.sandboxPath,
            previousFailure,
            attempt,
            signal,
          }),
        remaining(),
      );
      if (remaining() <= 0) throw new BudgetExceededError();
    } catch (error) {
      const timedOut = error instanceof BudgetExceededError;
      yield stage({
        stage: "writing_code",
        status: "failed",
        detail: timedOut
          ? "Total analysis budget exhausted during code generation"
          : `Fireworks failed: ${error instanceof Error ? error.message : "unknown error"}`,
        attempt,
      });
      yield {
        type: "finding",
        finding: {
          verdict: "unverified",
          reason: timedOut ? "timeout" : "upstream_error",
          detail: timedOut
            ? "The total run budget expired before code generation completed."
            : error instanceof Error
              ? error.message
              : "Fireworks code generation failed.",
          code: lastCode,
          attempts: attempt,
        },
        elapsedMs: elapsed(),
      };
      return null;
    }

    lastCode = toGeneratedCode(output);
    yield stage({
      stage: "writing_code",
      status: "complete",
      detail: `Generated ${lastCode.lineCount} lines of pandas`,
      attempt,
    });
    yield stage({
      stage: "running_sandbox",
      status: "active",
      detail: attempt === 1 ? "Executing generated code" : "Re-running corrected code",
      attempt,
    });

    let execution: ExecutionResult;
    try {
      const timeoutMs = Math.min(executionTimeoutMs, remaining());
      execution = await withinBudget(
        (signal) =>
          options.executor.execute({
            code: output.code,
            csvPath: options.sandboxPath,
            timeoutMs,
            signal,
          }),
        remaining(),
      );
      if (remaining() <= 0) throw new BudgetExceededError();
    } catch (error) {
      const timedOut = error instanceof BudgetExceededError;
      yield stage({
        stage: "running_sandbox",
        status: "failed",
        detail: timedOut
          ? "Total analysis budget exhausted during execution"
          : `Executor failed: ${error instanceof Error ? error.message : "unknown error"}`,
        attempt,
      });
      yield {
        type: "finding",
        finding: {
          verdict: "unverified",
          reason: timedOut ? "timeout" : "code_error",
          detail: error instanceof Error ? error.message : "Code execution failed.",
          code: lastCode,
          attempts: attempt,
        },
        elapsedMs: elapsed(),
      };
      return null;
    }

    if (execution.exitCode === 0 && execution.value !== null) {
      yield stage({
        stage: "running_sandbox",
        status: "complete",
        detail: `Exit 0 in ${execution.durationMs}ms`,
        attempt,
      });
      return execution;
    }

    const stderr =
      execution.stderr.trim() ||
      execution.stdout.trim() ||
      `Execution exited ${execution.exitCode} without a usable result.`;
    yield stage({
      stage: "running_sandbox",
      status: "failed",
      detail: `${stderr.slice(0, 240)}${
        stderr.length > 240 ? "…" : ""
      }`,
      attempt,
    });
    previousFailure = {
      stderr,
      failingCode: output.code,
    };

    if (attempt === maxAttempts) {
      yield stage({
        stage: "verifying",
        status: "failed",
        detail: "Retry cap reached — blocking an unverified answer",
        attempt,
      });
      yield {
        type: "finding",
        finding: {
          verdict: "unverified",
          reason: "retry_exhausted",
          detail: `${maxAttempts} attempts failed. Last error: ${stderr}`,
          code: lastCode,
          attempts: attempt,
        },
        elapsedMs: elapsed(),
      };
      return null;
    }
  }

  return null;
}
