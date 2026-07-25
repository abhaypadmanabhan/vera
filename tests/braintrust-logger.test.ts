import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Finding } from "@/lib/types";

const braintrust = vi.hoisted(() => {
  const rootSpan = {
    end: vi.fn(),
    flush: vi.fn<() => Promise<void>>(),
    log: vi.fn(),
  };
  const logger = {
    flush: vi.fn<() => Promise<void>>(),
    loggingState: {},
    startSpan: vi.fn(() => rootSpan),
  };

  return {
    initLogger: vi.fn(() => logger),
    logger,
    rootSpan,
    withCurrent: vi.fn(
      <Result>(_span: unknown, callback: () => Result): Result => callback(),
    ),
  };
});

vi.mock("braintrust", () => ({
  initLogger: braintrust.initLogger,
  withCurrent: braintrust.withCurrent,
}));

vi.mock("@/lib/config", () => ({ MOCK_MODE: false }));

const verifiedFinding: Finding = {
  verdict: "verified",
  claim: "Revenue was $100.",
  value: 100,
  unit: "USD",
  code: {
    language: "python",
    source: "print(100)",
    explanation: "Returns revenue.",
    lineCount: 1,
  },
  execution: {
    exitCode: 0,
    stdout: "100",
    stderr: "",
    value: 100,
    contextValues: {},
    durationMs: 12,
  },
  grounding: {
    columns: ["revenue"],
    rowCount: 1,
    rowRange: [0, 0],
    sampleCells: [{ row: 0, column: "revenue", value: "100" }],
    schemaEvidence: [],
  },
  attempts: 1,
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("BRAINTRUST_API_KEY", "test-key");
  braintrust.initLogger.mockClear();
  braintrust.logger.flush.mockReset();
  braintrust.logger.flush.mockResolvedValue();
  braintrust.logger.startSpan.mockClear();
  braintrust.rootSpan.end.mockReset();
  braintrust.rootSpan.flush.mockReset();
  braintrust.rootSpan.flush.mockResolvedValue();
  braintrust.rootSpan.log.mockReset();
  braintrust.withCurrent.mockClear();
});

describe("Braintrust analysis trace", () => {
  it("keeps model work under a named analysis root and flushes the completed trace", async () => {
    const { beginAnalysisTrace } = await import("@/lib/braintrust/logger");
    const trace = beginAnalysisTrace({
      question: "What was revenue?",
      datasetId: "demo",
    });
    const result = await trace.run(async () => "model result");

    await trace.finish({
      finding: verifiedFinding,
      durationMs: 34,
    });

    expect(result).toBe("model result");
    expect(braintrust.initLogger).toHaveBeenCalledWith({
      projectName: "Vera Accuracy Benchmark",
      apiKey: "test-key",
      asyncFlush: false,
    });
    expect(braintrust.logger.startSpan).toHaveBeenCalledWith({
      name: "analysis",
      type: "task",
      event: {
        input: {
          question: "What was revenue?",
          dataset: "demo",
        },
      },
    });
    expect(braintrust.withCurrent).toHaveBeenCalledWith(
      braintrust.rootSpan,
      expect.any(Function),
      braintrust.logger.loggingState,
    );
    expect(braintrust.rootSpan.log).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          verdict: "verified",
          value: 100,
        }),
        metadata: expect.objectContaining({
          columns: ["revenue"],
          groundedRows: 1,
          verdict: "verified",
        }),
      }),
    );
    expect(braintrust.rootSpan.end).toHaveBeenCalledOnce();
    expect(braintrust.rootSpan.flush).toHaveBeenCalledOnce();
  });

  it("does nothing without a key", async () => {
    vi.stubEnv("BRAINTRUST_API_KEY", "");
    const { beginAnalysisTrace } = await import("@/lib/braintrust/logger");

    const trace = beginAnalysisTrace({
      question: "What was revenue?",
      datasetId: "demo",
    });

    await expect(trace.run(async () => "model result")).resolves.toBe("model result");
    await expect(
      trace.finish({ finding: null, durationMs: 1 }),
    ).resolves.toBeUndefined();
    expect(braintrust.initLogger).not.toHaveBeenCalled();
  });

  it("never lets a flush failure fail the analysis", async () => {
    braintrust.rootSpan.flush.mockRejectedValueOnce(new Error("Braintrust unavailable"));
    const { beginAnalysisTrace } = await import("@/lib/braintrust/logger");
    const trace = beginAnalysisTrace({
      question: "What was revenue?",
      datasetId: "demo",
    });

    await expect(
      trace.finish({
        finding: null,
        error: "Analysis failed",
        durationMs: 5,
      }),
    ).resolves.toBeUndefined();
  });

  it("runs analysis work once when Braintrust context setup fails", async () => {
    braintrust.withCurrent.mockImplementationOnce(() => {
      throw new Error("Context unavailable");
    });
    const callback = vi.fn(async () => "model result");
    const { beginAnalysisTrace } = await import("@/lib/braintrust/logger");
    const trace = beginAnalysisTrace({
      question: "What was revenue?",
      datasetId: "demo",
    });

    await expect(trace.run(callback)).resolves.toBe("model result");
    expect(callback).toHaveBeenCalledOnce();
  });

  it("bounds a stalled flush so telemetry cannot stall completion", async () => {
    vi.useFakeTimers();
    braintrust.rootSpan.flush.mockImplementationOnce(() => new Promise(() => undefined));
    const { beginAnalysisTrace } = await import("@/lib/braintrust/logger");
    const trace = beginAnalysisTrace({
      question: "What was revenue?",
      datasetId: "demo",
    });
    const finish = trace.finish({ finding: verifiedFinding, durationMs: 34 });
    const outcome = Promise.race([
      finish.then(() => "completed" as const),
      new Promise<"timed-out">((resolve) =>
        setTimeout(() => resolve("timed-out"), 2_000),
      ),
    ]);

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(outcome).resolves.toBe("completed");
    vi.useRealTimers();
  });
});
