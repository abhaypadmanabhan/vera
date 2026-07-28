import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "@/lib/config";
import { readEventStream } from "@/lib/stream";
import type {
  AnalysisRequest,
  Analyst,
  DatasetProfile,
  Finding,
  StageEvent,
} from "@/lib/types";

const lifecycle = vi.hoisted(() => ({
  mode: "error" as "error" | "pending" | "setup-error",
  next: vi.fn<() => Promise<IteratorResult<StageEvent>>>(),
  close: vi.fn<() => Promise<IteratorResult<StageEvent>>>(),
}));

const analysisTelemetry = vi.hoisted(() => ({
  finish: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/braintrust/logger", () => ({
  beginAnalysisTrace: () => ({
    run: <Result>(callback: () => Result): Result => callback(),
    finish: analysisTelemetry.finish,
  }),
}));

vi.mock("@/lib/analyst", () => ({
  getAnalyst: (): Analyst => {
    if (lifecycle.mode === "setup-error") throw new Error("Analyst unavailable");

    return {
      run(): AsyncIterable<StageEvent> {
        if (lifecycle.mode === "error") {
          return {
            async *[Symbol.asyncIterator]() {
              throw new Error("Engine exploded");
            },
          };
        }

        return {
          [Symbol.asyncIterator]() {
            return {
              next: lifecycle.next,
              return: lifecycle.close,
            };
          },
        };
      },
    };
  },
}));

import { POST, runDeckQuestions } from "@/app/api/analyze/route";

const body = {
  question: "What happened?",
  datasetId: "upload",
  upload: {
    filename: "business.csv",
    content: "month,revenue\n2025-07,100\n",
  },
};

function request(ip: string, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
    signal,
  });
}

beforeEach(() => {
  lifecycle.mode = "error";
  lifecycle.next.mockReset();
  lifecycle.close.mockReset();
  analysisTelemetry.finish.mockReset();
  analysisTelemetry.finish.mockResolvedValue();
});

describe("POST /api/analyze stream lifecycle", () => {
  it("streams an error event and closes when the analyst throws", async () => {
    const response = await POST(request("route-engine-error"));
    if (!response.body) throw new Error("Expected a response body");

    const events: StageEvent[] = [];
    for await (const event of readEventStream(response.body)) events.push(event);

    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        message: "Engine exploded",
      }),
    ]);
  });

  it("streams an error event when analyst setup throws synchronously", async () => {
    lifecycle.mode = "setup-error";
    const response = await POST(request("route-setup-error"));
    if (!response.body) throw new Error("Expected a response body");

    const events: StageEvent[] = [];
    for await (const event of readEventStream(response.body)) events.push(event);

    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        message: "Analyst unavailable",
      }),
    ]);
  });

  it("returns the analyst iterator when the client cancels", async () => {
    lifecycle.mode = "pending";
    lifecycle.next.mockImplementation(() => new Promise(() => undefined));
    lifecycle.close.mockResolvedValue({ done: true, value: undefined });
    const response = await POST(request("route-cancel"));
    if (!response.body) throw new Error("Expected a response body");

    await response.body.cancel();

    expect(lifecycle.close).toHaveBeenCalledOnce();
  });

  it("closes a pending stream promptly when the request signal aborts", async () => {
    vi.useFakeTimers();
    lifecycle.mode = "pending";
    lifecycle.next.mockImplementation(() => new Promise(() => undefined));
    lifecycle.close.mockResolvedValue({ done: true, value: undefined });
    const abortController = new AbortController();
    const response = await POST(
      request("route-request-abort", abortController.signal),
    );
    if (!response.body) throw new Error("Expected a response body");
    const reader = response.body.getReader();
    const pendingRead = reader.read();

    abortController.abort();
    const outcome = await Promise.race([
      pendingRead.then(() => "closed" as const),
      new Promise<"timed-out">((resolve) =>
        setTimeout(() => resolve("timed-out"), 25),
      ),
    ]);

    try {
      expect(outcome).toBe("closed");
      expect(lifecycle.close).toHaveBeenCalledOnce();
      expect(analysisTelemetry.finish).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(LIMITS.runBudgetMs);
      await vi.waitFor(() => {
        expect(analysisTelemetry.finish).toHaveBeenCalledOnce();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes telemetry only after in-flight analysis work settles on abort", async () => {
    lifecycle.mode = "pending";
    let resolveNext:
      | ((result: IteratorResult<StageEvent>) => void)
      | undefined;
    lifecycle.next.mockImplementation(
      () =>
        new Promise<IteratorResult<StageEvent>>((resolve) => {
          resolveNext = resolve;
        }),
    );
    lifecycle.close.mockResolvedValue({ done: true, value: undefined });
    const abortController = new AbortController();
    const response = await POST(
      request("route-abort-trace-order", abortController.signal),
    );
    if (!response.body) throw new Error("Expected a response body");
    const pendingRead = response.body.getReader().read();

    abortController.abort();
    await pendingRead;

    expect(lifecycle.close).toHaveBeenCalledOnce();
    expect(analysisTelemetry.finish).not.toHaveBeenCalled();

    resolveNext?.({ done: true, value: undefined });
    await vi.waitFor(() => {
      expect(analysisTelemetry.finish).toHaveBeenCalledOnce();
    });
  });

  it("closes cleanly when iterator cleanup itself fails", async () => {
    lifecycle.mode = "pending";
    lifecycle.next.mockImplementation(() => new Promise(() => undefined));
    lifecycle.close.mockRejectedValue(new Error("Cleanup failed"));
    const response = await POST(request("route-cancel-cleanup-error"));
    if (!response.body) throw new Error("Expected a response body");

    await expect(response.body.cancel()).resolves.toBeUndefined();
    expect(lifecycle.close).toHaveBeenCalledOnce();
  });
});

/*
 * CodeRabbit on PR #42. `realAnalyst` re-profiles the prepared artifact when it
 * can read it and falls back to the RAW file and RAW profile when that artifact
 * has gone stale. The route used to derive follow-ups from the cached prep
 * profile either way, so after a stale fallback it proposed questions about
 * columns prep invented — columns the analyst never sees.
 *
 * The verified finding's grounding columns were checked against the profile the
 * analyst actually used, so they are the evidence of which schema ran.
 */
const RAW_PROFILE: DatasetProfile = {
  datasetId: "biz",
  filename: "biz.csv",
  rowCount: 10,
  duplicateRowCount: 0,
  crossChecks: [],
  notes: [],
  columns: [
    {
      name: "revenue",
      kind: "number",
      nullCount: 0,
      distinctCount: 10,
      sampleValues: ["100"],
      dateFormat: null,
      evidence: null,
    },
    {
      name: "region",
      kind: "category",
      nullCount: 0,
      distinctCount: 3,
      sampleValues: ["East"],
      dateFormat: null,
      evidence: null,
    },
  ],
};

/** What prep produced: different column names, so the two disagree out loud. */
const PREPARED_PROFILE: DatasetProfile = {
  ...RAW_PROFILE,
  columns: [
    { ...RAW_PROFILE.columns[0]!, name: "net_revenue" },
    { ...RAW_PROFILE.columns[1]!, name: "channel" },
  ],
};

/** Grounded in RAW columns: this run read the original file, not the artifact. */
const GROUNDED_IN_RAW: Finding = {
  verdict: "verified",
  value: 100,
  unit: null,
  claim: "Total revenue came to 100.",
  code: {
    language: "python",
    source: "print(1)",
    explanation: "Summed revenue.",
    lineCount: 2,
  },
  execution: {
    exitCode: 0,
    stdout: "100",
    stderr: "",
    value: 100,
    contextValues: {},
    durationMs: 1,
  },
  grounding: {
    columns: ["revenue"],
    rowCount: 10,
    rowRange: [0, 9],
    sampleCells: [],
    schemaEvidence: [],
  },
  context: [],
  valence: "neutral",
  attempts: 1,
};

/** Grounded in PREPARED columns: this run really did read the artifact. */
const GROUNDED_IN_PREPARED: Finding = {
  ...GROUNDED_IN_RAW,
  grounding: { ...GROUNDED_IN_RAW.grounding, columns: ["net_revenue"] },
};

function analystRecording(finding: Finding, calls: string[]): Analyst {
  let run = 0;
  return {
    async *run(analysis: AnalysisRequest): AsyncIterable<StageEvent> {
      calls.push(analysis.question);
      // Only the first run produces a finding; the second just records the
      // follow-up question it was handed and ends the deck.
      if (run === 0) yield { type: "finding", finding, elapsedMs: 1 };
      run += 1;
    },
  };
}

async function askedQuestions(
  finding: Finding,
  request: AnalysisRequest,
): Promise<string[]> {
  const calls: string[] = [];
  // Draining the stream is the point; the events themselves are not.
  const events = runDeckQuestions(
    analystRecording(finding, calls),
    request,
    2,
  )[Symbol.asyncIterator]();
  while (!(await events.next()).done);
  return calls;
}

describe("runDeckQuestions — follow-ups follow the schema that actually ran", () => {
  const request: AnalysisRequest = {
    question: "What was total revenue?",
    dataset: {
      id: "biz",
      filename: "biz.csv",
      content: "revenue,region\n100,East\n",
      profile: RAW_PROFILE,
    },
    analysisPath: "/home/daytona/clean-biz.csv",
    analysisProfile: PREPARED_PROFILE,
  };

  it("suggests from the raw profile when the finding proves the artifact was not used", async () => {
    const calls = await askedQuestions(GROUNDED_IN_RAW, request);

    expect(calls[0]).toBe("What was total revenue?");
    // The stale-artifact run read `revenue` and `region`. A follow-up naming
    // `net revenue` or `channel` would be about columns it never sees.
    expect(calls[1]).toBe("Which region had the highest revenue?");
  });

  it("still suggests from the prepared profile when that is what the run read", async () => {
    const calls = await askedQuestions(GROUNDED_IN_PREPARED, request);

    expect(calls[0]).toBe("What was total revenue?");
    expect(calls[1]).toBe("Which channel had the highest net revenue?");
  });
});
