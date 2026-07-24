import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/config";
import {
  type RetryOutcome,
  runCodegenWithRetries,
  type CodeExecutor,
  type CodeGenerator,
} from "@/lib/codegen/retry";
import type {
  DatasetProfile,
  ExecutionResult,
  StageEvent,
} from "@/lib/types";

const profile: DatasetProfile = {
  datasetId: "tiny",
  filename: "tiny.csv",
  rowCount: 1,
  duplicateRowCount: 0,
  crossChecks: [],
  columns: [],
  notes: [],
};

const generated = (attempt: number) => ({
  headline: "Sales came to 143,787 dollars.",
  code: `print("VERA_RESULT:${attempt}")`,
  explanation: `attempt ${attempt}`,
  columnsUsed: [],
});

const failedExecution = (stderr: string): ExecutionResult => ({
  exitCode: 1,
  stdout: "",
  stderr,
  value: null,
  durationMs: 3,
});

const successfulExecution: ExecutionResult = {
  exitCode: 0,
  stdout: "VERA_RESULT:42\n",
  stderr: "",
  value: 42,
  durationMs: 3,
};

async function drain(
  generator: AsyncGenerator<StageEvent, RetryOutcome | null>,
): Promise<{ events: StageEvent[]; result: RetryOutcome | null }> {
  const events: StageEvent[] = [];
  while (true) {
    const next = await generator.next();
    if (next.done) return { events, result: next.value };
    events.push(next.value);
  }
}

describe("codegen retry orchestration", () => {
  it("feeds stderr and failing code into the next generation attempt", async () => {
    const requests: Parameters<CodeGenerator["generate"]>[0][] = [];
    const generator: CodeGenerator = {
      async generate(request) {
        requests.push(request);
        return generated(request.attempt);
      },
    };
    let executions = 0;
    const executor: CodeExecutor = {
      async execute() {
        executions++;
        return executions === 1
          ? failedExecution("NameError: missing_name")
          : successfulExecution;
      },
    };

    const { events, result } = await drain(
      runCodegenWithRetries({
        question: "answer it",
        profile,
        sampleRows: [],
        sandboxPath: "/workspace/data.csv",
        generator,
        executor,
      }),
    );

    expect(requests[1]?.previousFailure).toEqual({
      stderr: "NameError: missing_name",
      failingCode: 'print("VERA_RESULT:1")',
    });
    expect(result?.execution).toEqual(successfulExecution);
    expect(
      events
        .filter(
          (event): event is Extract<StageEvent, { type: "stage" }> =>
            event.type === "stage",
        )
        .filter(
          (event) =>
            event.stage === "writing_code" && event.status === "active",
        )
        .map((event) => event.attempt),
    ).toEqual([1, 2]);
  });

  it("hard-caps attempts at the initial run plus LIMITS.maxRetries", async () => {
    let generationCount = 0;
    let executionCount = 0;
    const generator: CodeGenerator = {
      async generate(request) {
        generationCount++;
        return generated(request.attempt);
      },
    };
    const executor: CodeExecutor = {
      async execute() {
        executionCount++;
        return failedExecution(`failure ${executionCount}`);
      },
    };

    const { events, result } = await drain(
      runCodegenWithRetries({
        question: "answer it",
        profile,
        sampleRows: [],
        sandboxPath: "/workspace/data.csv",
        generator,
        executor,
      }),
    );
    const terminal = events.at(-1);

    expect(generationCount).toBe(1 + LIMITS.maxRetries);
    expect(executionCount).toBe(1 + LIMITS.maxRetries);
    expect(result).toBeNull();
    expect(terminal).toMatchObject({
      type: "finding",
      finding: {
        verdict: "unverified",
        reason: "retry_exhausted",
        attempts: 1 + LIMITS.maxRetries,
      },
    });
    if (terminal?.type !== "finding") throw new Error("Expected finding");
    expect(Object.hasOwn(terminal.finding, "value")).toBe(false);
  });

  it("cannot bypass LIMITS.maxRetries with a larger caller option", async () => {
    let executionCount = 0;
    const generator: CodeGenerator = {
      async generate(request) {
        return generated(request.attempt);
      },
    };
    const executor: CodeExecutor = {
      async execute() {
        executionCount++;
        return failedExecution("always broken");
      },
    };

    await drain(
      runCodegenWithRetries({
        question: "answer it",
        profile,
        sampleRows: [],
        sandboxPath: "/workspace/data.csv",
        generator,
        executor,
        maxRetries: 99,
      }),
    );

    expect(executionCount).toBe(1 + LIMITS.maxRetries);
  });

  it("normalizes a non-finite retry option without bypassing the initial attempt", async () => {
    let executionCount = 0;
    const generator: CodeGenerator = {
      async generate(request) {
        return generated(request.attempt);
      },
    };
    const executor: CodeExecutor = {
      async execute() {
        executionCount++;
        return failedExecution("broken");
      },
    };

    await drain(
      runCodegenWithRetries({
        question: "answer it",
        profile,
        sampleRows: [],
        sandboxPath: "/workspace/data.csv",
        generator,
        executor,
        maxRetries: Number.NaN,
      }),
    );

    expect(executionCount).toBe(1);
  });

  it("feeds a thrown executor error back into codegen for retry", async () => {
    const requests: Parameters<CodeGenerator["generate"]>[0][] = [];
    const generator: CodeGenerator = {
      async generate(request) {
        requests.push(request);
        return generated(request.attempt);
      },
    };
    let executionCount = 0;
    const executor: CodeExecutor = {
      async execute() {
        executionCount++;
        if (executionCount === 1) {
          throw new Error("SyntaxError: invalid syntax");
        }
        return successfulExecution;
      },
    };

    const { result } = await drain(
      runCodegenWithRetries({
        question: "answer it",
        profile,
        sampleRows: [],
        sandboxPath: "/workspace/data.csv",
        generator,
        executor,
      }),
    );

    expect(requests[1]?.previousFailure).toEqual({
      stderr: "SyntaxError: invalid syntax",
      failingCode: 'print("VERA_RESULT:1")',
    });
    expect(result?.execution).toEqual(successfulExecution);
  });

  it("emits a failed writing stage and unverified finding on Fireworks failure", async () => {
    const generator: CodeGenerator = {
      async generate() {
        throw new Error("Fireworks unavailable");
      },
    };
    const executor: CodeExecutor = {
      async execute() {
        throw new Error("must not execute");
      },
    };

    const { events } = await drain(
      runCodegenWithRetries({
        question: "answer it",
        profile,
        sampleRows: [],
        sandboxPath: "/workspace/data.csv",
        generator,
        executor,
      }),
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "stage",
        stage: "writing_code",
        status: "failed",
        attempt: 1,
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "finding",
      finding: {
        verdict: "unverified",
        reason: "upstream_error",
        attempts: 1,
      },
    });
  });

  it("applies one wall-clock budget across attempts", async () => {
    let now = 0;
    let executionCount = 0;
    const generator: CodeGenerator = {
      async generate(request) {
        now += request.attempt === 1 ? 20 : 40;
        return generated(request.attempt);
      },
    };
    const executor: CodeExecutor = {
      async execute() {
        executionCount++;
        now += 30;
        return failedExecution("still broken");
      },
    };

    const { events } = await drain(
      runCodegenWithRetries({
        question: "answer it",
        profile,
        sampleRows: [],
        sandboxPath: "/workspace/data.csv",
        generator,
        executor,
        runBudgetMs: 80,
        now: () => now,
      }),
    );

    expect(executionCount).toBe(1);
    expect(events.at(-1)).toMatchObject({
      type: "finding",
      finding: {
        verdict: "unverified",
        reason: "timeout",
        attempts: 2,
      },
    });
  });
});
