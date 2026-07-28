import { afterEach, describe, expect, it, vi } from "vitest";
import { mockAnalyst } from "@/lib/mock/engine";
import { resolveUpload } from "@/lib/datasets";
import type { AnalysisRequest, StageEvent } from "@/lib/types";

const request = (question: string): AnalysisRequest => ({
  question,
  dataset: resolveUpload({
    filename: "business.csv",
    content: "Sub-Category,Profit,OrderDate\nTables,-100,15/04/2019\nChairs,50,03/02/2018\n",
  }),
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

/*
 * Macroscope on PR #42 (High). NOT_A_MEASURE was a substring match, so `id`
 * fired inside `paid_amount` and `month` inside `monthly_revenue`. The mock
 * skipped the real measure and summed a worse column, while still labelling the
 * answer as being about the one it skipped.
 *
 * (Its third example, `daily_sales`, was wrong — "day" is not a substring of
 * "daily" — and a test written around it passed with the bug still in place.)
 */
describe("choosing which column to total", () => {
  const measuredColumn = async (header: string, rows: string[]): Promise<string> => {
    const events: StageEvent[] = [];
    vi.useFakeTimers();
    const pending = (async () => {
      for await (const event of mockAnalyst.run({
        question: "What is the total?",
        dataset: resolveUpload({
          filename: "measures.csv",
          content: `${header}\n${rows.join("\n")}\n`,
        }),
      })) {
        events.push(event);
      }
    })();
    await vi.runAllTimersAsync();
    await pending;
    const finding = events.find((event) => event.type === "finding");
    if (finding?.type !== "finding" || finding.finding.verdict !== "verified") {
      throw new Error("expected a verified finding");
    }
    return finding.finding.grounding.columns.join(",");
  };

  // The control column must be one the OLD substring regex ACCEPTED, or both
  // candidates get rejected and `numeric[0]` picks the right one by accident.
  // `widget_count` is not such a column — "wIDget" contains "id".
  it("picks a measure whose name merely contains a stamp word", async () => {
    const columns = await measuredColumn("Region,monthly_revenue,total_units", [
      "West,100,7",
      "East,50,3",
    ]);
    expect(columns).toContain("monthly_revenue");
    expect(columns).not.toContain("total_units");
  });

  it("picks paid_amount rather than treating 'id' inside 'paid' as a key", async () => {
    const columns = await measuredColumn("Region,paid_amount,total_units", [
      "West,100,7",
      "East,50,3",
    ]);
    expect(columns).toContain("paid_amount");
    expect(columns).not.toContain("total_units");
  });

  it("still refuses to total a column that IS a stamp", async () => {
    const columns = await measuredColumn("Region,OrderYear,Sales", [
      "West,2018,100",
      "East,2019,50",
    ]);
    expect(columns).toContain("Sales");
    expect(columns).not.toContain("OrderYear");
  });
});
