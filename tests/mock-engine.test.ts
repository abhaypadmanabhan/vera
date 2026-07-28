import { afterEach, describe, expect, it, vi } from "vitest";
import { mockAnalyst } from "@/lib/mock/engine";
import { resolveUpload } from "@/lib/datasets";
import type { AnalysisRequest, Finding, StageEvent } from "@/lib/types";

type VerifiedFinding = Extract<Finding, { verdict: "verified" }>;

/** Run the mock over a CSV written inline and hand back the finding it produced. */
async function verifiedFinding(content: string): Promise<VerifiedFinding> {
  vi.useFakeTimers();
  const events: StageEvent[] = [];
  const pending = (async () => {
    for await (const event of mockAnalyst.run({
      question: "What is the total?",
      dataset: resolveUpload({ filename: "measures.csv", content }),
    })) {
      events.push(event);
    }
  })();
  await vi.runAllTimersAsync();
  await pending;
  const event = events.find((candidate) => candidate.type === "finding");
  if (event?.type !== "finding" || event.finding.verdict !== "verified") {
    throw new Error("expected a verified finding");
  }
  return event.finding;
}

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
    const finding = await verifiedFinding(`${header}\n${rows.join("\n")}\n`);
    return finding.grounding.columns.join(",");
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

/*
 * Macroscope on PR #41/#42 (Medium ×4). Mock mode is a surface the builder
 * demos, so a figure the code panel beside it could not have produced is the
 * dishonesty PRD §6 exists to prevent — even though nothing executes.
 */
describe("the mock only claims what its own code and cells support", () => {
  it("cleans a currency column in the code it displays, not just in TypeScript", async () => {
    const finding = await verifiedFinding('Region,Amount\nWest,"$1,000.50"\nEast,$2.00\n');
    expect(finding.value).toBe(1002.5);

    const lines = finding.code.source.split("\n");
    const cleaned = lines.findIndex((line) => line.includes("pd.to_numeric("));
    const summed = lines.findIndex((line) => line.includes(".sum()"));

    // `.sum()` on "$1,000.50" concatenates strings in pandas; round() then raises.
    expect(cleaned).toBeGreaterThanOrEqual(0);
    expect(finding.code.source).toContain('df["Amount"] = pd.to_numeric(');
    expect(finding.code.source).toContain('str.replace(r"[$,%\\s]", "", regex=True)');
    expect(cleaned).toBeLessThan(summed);
  });

  it("skips a blank cell instead of averaging it in as a zero", async () => {
    const finding = await verifiedFinding("Region,Sales\nWest,10\nEast,\n");
    expect(finding.value).toBe(10);
    // One row has a value. The average is 10, not 10/2.
    expect(finding.execution.contextValues.per_record).toBe(10);
    // And East never reported anything, so it is not a subtotal of 0.
    expect(finding.context.map((figure) => figure.name)).toEqual(["West"]);
  });

  it("reports zero records for a header-only file rather than a leftover 24", async () => {
    const finding = await verifiedFinding("Region,Sales\n");
    expect(finding.value).toBe(0);
    expect(finding.claim).toContain("0 records");
    expect(finding.execution.stdout.trim()).toBe("0");
    expect(finding.grounding.rowCount).toBe(0);
  });

  it("grounds every column its context figures cite", async () => {
    const finding = await verifiedFinding("Region,Sales\nWest,100\nEast,50\n");
    const cited = [...new Set(finding.context.flatMap((figure) => figure.columnsUsed))].sort();

    // The fixture only discriminates if the breakdown really cites the category.
    expect(cited).toEqual(["Region", "Sales"]);
    for (const column of cited) expect(finding.grounding.columns).toContain(column);
    expect(finding.grounding.sampleCells.some((cell) => cell.column === "Region")).toBe(true);
  });
});

/*
 * Macroscope on PR #43, reviewing the header-only fix. rowCount became 0 but
 * rowRange was still [0, Math.max(rowCount - 1, 0)] = [0, 0], which asserts
 * row 0 was read. verifyGrounding on the real path returns null there.
 */
describe("grounding for a file with no body rows", () => {
  it("reports no row range rather than claiming row 0", async () => {
    vi.useFakeTimers();
    const events: StageEvent[] = [];
    const pending = (async () => {
      for await (const event of mockAnalyst.run({
        question: "How many records are there?",
        dataset: resolveUpload({ filename: "empty.csv", content: "City,Widgets\n" }),
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
    expect(finding.finding.grounding.rowCount).toBe(0);
    expect(finding.finding.grounding.rowRange).toBeNull();
  });
});
