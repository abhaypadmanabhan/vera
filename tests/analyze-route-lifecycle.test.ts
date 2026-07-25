import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "@/lib/config";
import { readEventStream } from "@/lib/stream";
import type { Analyst, StageEvent } from "@/lib/types";

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

import { POST } from "@/app/api/analyze/route";

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
