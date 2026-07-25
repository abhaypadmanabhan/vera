import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prepare/run", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/prepare/run")>();
  return {
    ...actual,
    prepareDataset: vi.fn(actual.prepareDataset),
  };
});

import { LIMITS } from "@/lib/config";
import { contentHash } from "@/lib/datasets";
import { setPrep } from "@/lib/prepare/store";
import {
  prepareDataset,
  type PrepReport,
} from "@/lib/prepare/run";
import { POST, runtime } from "@/app/api/prepare/route";

interface PrepStageEvent {
  type: "prep-stage";
  stage: "profiling" | "cleaning" | "checking" | "ready";
  status: "active" | "complete" | "failed";
  detail: string;
}

interface PrepReportEvent {
  type: "prep-report";
  summary: {
    filename: string;
    rowCount: number;
  };
  report: PrepReport;
}

type PrepEvent = PrepStageEvent | PrepReportEvent;

const upload = {
  filename: "business.csv",
  content: "month,revenue,cogs\n2025-07,100,60\n2025-08,120,70\n",
};

function prepareRequest(
  body: unknown,
  ip: string,
): Request {
  return new Request("http://localhost/api/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

function rawPrepareRequest(body: string, ip: string): Request {
  return new Request("http://localhost/api/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body,
  });
}

async function errorOf(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: string };
  return body.error ?? "";
}

async function prepEvents(response: Response): Promise<PrepEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .map((message) =>
      message
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim(),
    )
    .filter((data): data is string => Boolean(data))
    .map((data) => JSON.parse(data) as PrepEvent);
}

describe("POST /api/prepare", () => {
  it("uses the Node runtime and rejects malformed JSON", async () => {
    expect(runtime).toBe("nodejs");

    const response = await POST(
      rawPrepareRequest("{not-json", "prepare-malformed"),
    );

    expect(response.status).toBe(400);
    await expect(errorOf(response)).resolves.toContain("valid JSON");
  });

  it("rejects CSV content larger than the UTF-8 byte cap", async () => {
    const response = await POST(
      prepareRequest(
        {
          upload: {
            filename: "large.csv",
            content: "é".repeat(Math.floor(LIMITS.maxCsvBytes / 2) + 1),
          },
        },
        "prepare-over-cap",
      ),
    );

    expect(response.status).toBe(400);
    await expect(errorOf(response)).resolves.toContain(
      LIMITS.maxCsvBytes.toLocaleString(),
    );
  });

  it("rate limits before parsing the request body", async () => {
    const ip = "prepare-rate-first";

    for (let index = 0; index < LIMITS.rateLimit.requests; index++) {
      const response = await POST(rawPrepareRequest("{", ip));
      expect(response.status).toBe(400);
    }

    const blockedRequest = rawPrepareRequest("{", ip);
    const jsonSpy = vi.spyOn(blockedRequest, "json");
    const response = await POST(blockedRequest);

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(jsonSpy).not.toHaveBeenCalled();
    await expect(errorOf(response)).resolves.toContain(
      "Too many prepare requests",
    );
  });

  it("streams profiling, cleaning, checking, ready, then the report on a miss", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const response = await POST(
        prepareRequest(
          {
            upload: {
              ...upload,
              content: `${upload.content}2025-09,140,80\n`,
            },
          },
          "prepare-success",
        ),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain(
        "text/event-stream",
      );
      expect(response.headers.get("Cache-Control")).toBe(
        "no-cache, no-transform",
      );

      const events = await prepEvents(response);
      expect(
        events
          .filter(
            (event): event is PrepStageEvent =>
              event.type === "prep-stage",
          )
          .map((event) => [event.stage, event.status]),
      ).toEqual([
        ["profiling", "active"],
        ["profiling", "complete"],
        ["cleaning", "active"],
        ["cleaning", "complete"],
        ["checking", "active"],
        ["checking", "failed"],
        ["ready", "complete"],
      ]);
      expect(events.at(-1)).toMatchObject({
        type: "prep-report",
        summary: {
          filename: "business.csv",
          rowCount: 3,
        },
        report: {
          ok: true,
        },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("runs only one prep pipeline for concurrent identical uploads", async () => {
    const prepareDatasetSpy = vi.mocked(prepareDataset);
    prepareDatasetSpy.mockClear();
    const concurrentUpload = {
      filename: "concurrent.csv",
      content: "region,sales\nWest,301\nEast,402\n",
    };

    const responses = await Promise.all([
      POST(
        prepareRequest(
          { upload: concurrentUpload },
          "prepare-concurrent-one",
        ),
      ),
      POST(
        prepareRequest(
          { upload: concurrentUpload },
          "prepare-concurrent-two",
        ),
      ),
    ]);
    const eventSets = await Promise.all(responses.map(prepEvents));
    const reports = eventSets.map((events) => {
      const terminal = events.at(-1);
      if (terminal?.type !== "prep-report") {
        throw new Error("Expected a terminal prep report");
      }
      return terminal.report;
    });

    for (const events of eventSets) {
      expect(
        events
          .filter(
            (event): event is PrepStageEvent =>
              event.type === "prep-stage",
          )
          .map(({ stage, status }) => [stage, status]),
      ).toEqual([
        ["profiling", "active"],
        ["profiling", "complete"],
        ["cleaning", "active"],
        ["cleaning", "complete"],
        ["checking", "active"],
        ["checking", "failed"],
        ["ready", "complete"],
      ]);
    }
    expect(prepareDatasetSpy).toHaveBeenCalledTimes(1);
    expect(reports[0]).toEqual(reports[1]);
    expect(reports[0]?.ok).toBe(true);
  });

  it("streams only ready and the cached report on a cache hit", async () => {
    const cachedUpload = {
      filename: "cached.csv",
      content: "region,sales\nWest,10\nEast,20\n",
    };
    const cachedReport: PrepReport = {
      ok: true,
      analysisPath: "/home/daytona/clean-cached.csv",
      fixes: ["Trimmed stray spaces."],
      questions: ["What is the total sales?"],
      counts: {
        rowsBefore: 2,
        rowsAfter: 2,
        duplicatesDropped: 0,
        cellsCoerced: 0,
      },
    };
    setPrep(contentHash(cachedUpload.content), cachedReport);

    const response = await POST(
      prepareRequest({ upload: cachedUpload }, "prepare-cache-hit"),
    );
    const events = await prepEvents(response);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "prep-stage",
      stage: "ready",
      status: "complete",
    });
    expect(events[1]).toEqual(
      expect.objectContaining({
        type: "prep-report",
        report: cachedReport,
      }),
    );
  });

  it("honors a cached fail-open report without repeating prep", async () => {
    const failedUpload = {
      filename: "fail-open.csv",
      content: "region,sales\nNorth,not-a-number\n",
    };
    const failedReport: PrepReport = {
      ok: false,
      analysisPath: "/home/daytona/data.csv",
      fixes: [],
      questions: [],
      counts: null,
      detail:
        "Vera could not tidy this file, so she is working from it as it came.",
    };
    setPrep(contentHash(failedUpload.content), failedReport);

    const response = await POST(
      prepareRequest({ upload: failedUpload }, "prepare-fail-open"),
    );
    const events = await prepEvents(response);

    expect(response.status).toBe(200);
    expect(
      events
        .filter(
          (event): event is PrepStageEvent =>
            event.type === "prep-stage",
        )
        .map((event) => [event.stage, event.status]),
    ).toEqual([["ready", "complete"]]);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: "prep-report",
        report: failedReport,
      }),
    );
  });

  it("memoizes fail-open prep so a re-upload does not repeat work", async () => {
    const prepareDatasetSpy = vi.mocked(prepareDataset);
    prepareDatasetSpy.mockClear();
    const failedReport: PrepReport = {
      ok: false,
      analysisPath: "/home/daytona/data.csv",
      fixes: [],
      questions: [],
      counts: null,
      detail:
        "Vera could not tidy this file, so she is working from it as it came.",
    };
    prepareDatasetSpy.mockImplementationOnce(async (_dataset, dependencies) => {
      dependencies?.onProgress?.({
        stage: "cleaning",
        status: "active",
        detail: "Tidying only the issues the data can prove.",
      });
      dependencies?.onProgress?.({
        stage: "cleaning",
        status: "failed",
        detail: failedReport.detail ?? "",
      });
      return failedReport;
    });
    const failedUpload = {
      filename: "uncached-fail-open.csv",
      content: "region,value\nWest,913\n",
    };

    const firstResponse = await POST(
      prepareRequest(
        { upload: failedUpload },
        "prepare-uncached-fail-open-one",
      ),
    );
    const firstEvents = await prepEvents(firstResponse);
    const secondResponse = await POST(
      prepareRequest(
        { upload: failedUpload },
        "prepare-uncached-fail-open-two",
      ),
    );
    const secondEvents = await prepEvents(secondResponse);

    expect(firstResponse.status).toBe(200);
    expect(
      firstEvents
        .filter(
          (event): event is PrepStageEvent =>
            event.type === "prep-stage",
        )
        .map((event) => [event.stage, event.status]),
    ).toEqual([
      ["profiling", "active"],
      ["profiling", "complete"],
      ["cleaning", "active"],
      ["cleaning", "failed"],
      ["ready", "complete"],
    ]);
    expect(secondResponse.status).toBe(200);
    expect(
      secondEvents
        .filter(
          (event): event is PrepStageEvent =>
            event.type === "prep-stage",
        )
        .map((event) => [event.stage, event.status]),
    ).toEqual([["ready", "complete"]]);
    expect(firstEvents.at(-1)).toEqual(
      expect.objectContaining({
        type: "prep-report",
        report: {
          ok: false,
          analysisPath: "/home/daytona/data.csv",
          fixes: [],
          questions: [],
          counts: null,
          detail:
            "Vera could not tidy this file, so she is working from it as it came.",
        },
      }),
    );
    expect(secondEvents.at(-1)).toEqual(firstEvents.at(-1));
    expect(prepareDatasetSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing upload", {}],
    ["blank filename", { upload: { filename: "   ", content: "a\n1\n" } }],
    ["empty content", { upload: { filename: "empty.csv", content: "" } }],
    [
      "no data rows",
      { upload: { filename: "headers-only.csv", content: "region,sales\n" } },
    ],
  ])("rejects an invalid upload: %s", async (_label, body) => {
    const response = await POST(
      prepareRequest(body, `prepare-invalid-${_label}`),
    );

    expect(response.status).toBe(400);
  });
});
