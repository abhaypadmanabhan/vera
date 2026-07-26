import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as analystModule from "@/lib/analyst";
import { generatePandasCode } from "@/lib/codegen/generate";
import { SANDBOX_CSV_PATH } from "@/lib/daytona/sandbox";
import { realAnalyst } from "@/lib/real-analyst";
import { readEventStream } from "@/lib/stream";
import { contentHash, resolveUpload } from "@/lib/datasets";
import type { PrepReport } from "@/lib/prepare/run";
import { setPrep } from "@/lib/prepare/store";
import type {
  AnalysisRequest,
  Analyst,
  Finding,
  StageEvent,
} from "@/lib/types";
import { POST, runtime } from "@/app/api/analyze/route";

vi.mock("@/lib/codegen/generate", () => ({
  generatePandasCode: vi.fn(async () => ({
    code: 'print("VERA_RESULT:100")',
    explanation: "Sums Sales.",
    headline: "Sales came to {value}.",
    columnsUsed: ["Sales"],
    context: [
      {
        name: "prior",
        description: "the quarter before",
        columnsUsed: ["Sales"],
      },
      {
        name: "ghost",
        description: "never computed",
        columnsUsed: ["Sales"],
      },
    ],
    valence: "bad",
  })),
}));

vi.mock("@/lib/daytona/sandbox", () => ({
  SANDBOX_CSV_PATH: "/workspace/data.csv",
  getSandboxIdentity: vi.fn(() => 0),
  getWarmSandbox: vi.fn(async () => ({
    sandboxId: "stub",
    reused: true,
    readyMs: 0,
  })),
  ensureDatasetLoaded: vi.fn(async () => ({ uploaded: false, bytes: 13 })),
  daytonaExecutor: {
    execute: vi.fn(async () => ({
      exitCode: 0,
      stdout:
        'VERA_RESULT:{"value":100,"context":{"prior":99,"smuggled":1234}}',
      stderr: "",
      value: 100,
      contextValues: { prior: 99, smuggled: 1234 },
      durationMs: 1,
    })),
  },
}));

function analyzeRequest(
  body: unknown,
  ip: string,
  signal?: AbortSignal,
): Request {
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

const validBody = {
  question: "What was gross margin?",
  datasetId: "upload",
  upload: {
    filename: "business.csv",
    content: "month,revenue,cogs\n2025-07,100,60\n",
  },
};

const analysisDataset = resolveUpload({
  filename: "business.csv",
  content: "Sales\n100\n",
});

async function codegenRequestFor(
  request: AnalysisRequest,
): Promise<Parameters<typeof generatePandasCode>[0]> {
  const generate = vi.mocked(generatePandasCode);
  generate.mockClear();
  for await (const event of realAnalyst.run(request)) {
    if (event.type === "error") {
      throw new Error(event.message);
    }
  }
  const codegenRequest = generate.mock.calls[0]?.[0];
  if (!codegenRequest) throw new Error("Expected code generation to run.");
  return codegenRequest;
}

async function routeAnalysisRequestFor(
  body: typeof validBody,
  ip: string,
): Promise<AnalysisRequest> {
  let received: AnalysisRequest | undefined;
  const analyst: Analyst = {
    async *run(request) {
      received = request;
    },
  };
  const getAnalyst = vi
    .spyOn(analystModule, "getAnalyst")
    .mockReturnValue(analyst);

  try {
    const response = await POST(analyzeRequest(body, ip));
    expect(response.status).toBe(200);
    await response.text();
  } finally {
    getAnalyst.mockRestore();
  }

  if (!received) throw new Error("Expected the route to run the analyst.");
  return received;
}

describe("POST /api/analyze", () => {
  it("passes a successful cached prep path to the analyst", async () => {
    const preparedUpload = {
      filename: "prepared.csv",
      content: "kind,duration\nMovie,90 min\nSeries,2 Seasons\n",
    };
    const report: PrepReport = {
      ok: true,
      analysisPath: "/workspace/clean-prepared.csv",
      fixes: [],
      questions: [],
      counts: null,
    };
    setPrep(contentHash(preparedUpload.content), report);

    const received = await routeAnalysisRequestFor(
      { ...validBody, upload: preparedUpload },
      "route-prepared-path",
    );

    expect(received.analysisPath).toBe(report.analysisPath);
  });

  it("passes no prepared path when prep is unavailable", async () => {
    const received = await routeAnalysisRequestFor(
      {
        ...validBody,
        upload: {
          filename: "raw.csv",
          content: "kind,duration\nMovie,91 min\n",
        },
      },
      "route-missing-prep",
    );

    expect(received.analysisPath).toBeUndefined();
  });

  it("answers from the prepared file when prep succeeded", async () => {
    const codegenRequest = await codegenRequestFor({
      question: "What were total sales?",
      dataset: analysisDataset,
      analysisPath: "/workspace/clean-abc.csv",
    });

    expect(codegenRequest.sandboxPath).toBe("/workspace/clean-abc.csv");
  });

  it("answers from the raw file when prep never ran", async () => {
    const codegenRequest = await codegenRequestFor({
      question: "What were total sales?",
      dataset: analysisDataset,
    });

    expect(codegenRequest.sandboxPath).toBe(SANDBOX_CSV_PATH);
  });

  it("attaches only grounded context figures to the finding", async () => {
    let finding: Finding | null = null;
    for await (const event of realAnalyst.run({
      question: "What were total sales?",
      dataset: resolveUpload({
        filename: "business.csv",
        content: "Sales\n100\n",
      }),
    })) {
      if (event.type === "finding") finding = event.finding;
    }

    expect(finding?.verdict).toBe("verified");
    if (!finding || finding.verdict !== "verified") return;
    expect(finding.context.map((figure) => figure.name)).toEqual(["prior"]);
    expect(finding.valence).toBe("bad");
  });

  it("keeps paid SDKs outside the mock analyst import boundary", () => {
    const analystSource = readFileSync(
      new URL("../lib/analyst.ts", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(analystSource).not.toMatch(
      /from\s+["'](?:openai|@daytona\/sdk|braintrust|@elevenlabs)/,
    );
    expect(Object.keys(packageJson.dependencies ?? {})).not.toEqual(
      expect.arrayContaining([
        "openai",
        "@daytona/sdk",
        "braintrust",
        "@elevenlabs/elevenlabs-js",
      ]),
    );
  });

  it("uses the Node runtime and rejects a 600-character question", async () => {
    expect(runtime).toBe("nodejs");

    const response = await POST(
      analyzeRequest({ ...validBody, question: "q".repeat(600) }, "route-invalid"),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain("500 characters");
  });

  it("rejects CSV content larger than the configured byte limit", async () => {
    const response = await POST(
      analyzeRequest(
        {
          ...validBody,
          upload: {
            ...validBody.upload,
            content: "x".repeat(5_000_001),
          },
        },
        "route-large-csv",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain("5000000 bytes");
  });

  it("returns a clear 429 after the per-IP request limit", async () => {
    const ip = "route-rate-limit";

    for (let request = 0; request < 10; request++) {
      const response = await POST(
        analyzeRequest({ ...validBody, question: "q".repeat(600) }, ip),
      );
      expect(response.status).toBe(400);
    }

    const response = await POST(analyzeRequest(validBody, ip));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).not.toBeNull();
    await expect(response.text()).resolves.toContain("Too many analysis requests");
  });

  it("streams mock StageEvents without network egress", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const response = await POST(analyzeRequest(validBody, "route-valid"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(response.body).not.toBeNull();

      const eventsPromise = (async () => {
        const events: StageEvent[] = [];
        if (!response.body) throw new Error("Expected a response body");
        for await (const event of readEventStream(response.body)) events.push(event);
        return events;
      })();
      await vi.runAllTimersAsync();
      const events = await eventsPromise;

      expect(events[0]).toMatchObject({
        type: "stage",
        stage: "writing_code",
      });
      expect(events.at(-1)).toMatchObject({
        type: "finding",
        finding: { verdict: "verified" },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
