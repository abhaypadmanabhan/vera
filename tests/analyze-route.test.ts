import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readEventStream } from "@/lib/stream";
import type { StageEvent } from "@/lib/types";
import { POST, runtime } from "@/app/api/analyze/route";

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

describe("POST /api/analyze", () => {
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
