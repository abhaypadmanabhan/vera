import { afterEach, describe, expect, it, vi } from "vitest";
import { mockAnalyst } from "@/lib/mock/engine";
import type { AnalysisRequest, StageEvent } from "@/lib/types";

const request = (question: string): AnalysisRequest => ({
  question,
  csv: {
    filename: "business.csv",
    content: "month,revenue,cogs\n2025-07,100,60\n2025-08,120,70\n",
  },
});

async function collectEvents(question: string): Promise<StageEvent[]> {
  const events: StageEvent[] = [];
  for await (const event of mockAnalyst.run(request(question))) events.push(event);
  return events;
}

async function runMock(question: string): Promise<StageEvent[]> {
  vi.useFakeTimers();
  const pendingEvents = collectEvents(question);
  await vi.runAllTimersAsync();
  return pendingEvents;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("mockAnalyst", () => {
  it("emits all four stages in order and ends with a verified finding", async () => {
    const events = await runMock("What was gross margin?");
    const stageOrder = events
      .filter((event) => event.type === "stage")
      .map((event) => event.stage)
      .filter((stage, index, stages) => stage !== stages[index - 1]);

    expect(stageOrder).toEqual([
      "writing_code",
      "running_sandbox",
      "verifying",
      "done",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "finding",
      finding: { verdict: "verified" },
    });
  });

  it("returns an unverified finding without a value when the question contains fail", async () => {
    const events = await runMock("Please fail this analysis");
    const finalEvent = events.at(-1);

    expect(finalEvent).toMatchObject({
      type: "finding",
      finding: { verdict: "unverified" },
    });
    if (finalEvent?.type !== "finding") throw new Error("Expected a finding event");
    expect(Object.hasOwn(finalEvent.finding, "value")).toBe(false);
  });
});
