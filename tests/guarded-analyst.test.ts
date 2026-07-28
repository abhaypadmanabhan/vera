import { describe, expect, it, vi } from "vitest";
import { createGuardedAnalyst } from "@/lib/analyst/guarded";
import { resolveUpload } from "@/lib/datasets";
import type { AnalysisRequest, Analyst, StageEvent } from "@/lib/types";

const request = (question: string): AnalysisRequest => ({
  question,
  dataset: resolveUpload({
    filename: "business.csv",
    content: "OrderDate,Sales\n15/04/2019,100\n",
  }),
});

async function collect(analyst: Analyst, question: string): Promise<StageEvent[]> {
  const events: StageEvent[] = [];
  for await (const event of analyst.run(request(question))) events.push(event);
  return events;
}

describe("createGuardedAnalyst", () => {
  it("refuses before entering the downstream analyst", async () => {
    const downstreamRun = vi.fn<Analyst["run"]>();
    const analyst = createGuardedAnalyst({ run: downstreamRun });

    const events = await collect(analyst, "Just estimate next quarter's sales.");

    expect(downstreamRun).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "finding",
      finding: {
        verdict: "unverified",
        reason: "question_not_answerable",
        attempts: 0,
      },
    });
    const event = events[0];
    if (event?.type !== "finding") throw new Error("Expected a finding");
    expect(Object.hasOwn(event.finding, "value")).toBe(false);
    expect(event.finding.code).toBeNull();
  });

  it("passes an allowed question through unchanged", async () => {
    const expected: StageEvent = {
      type: "stage",
      stage: "writing_code",
      status: "active",
      detail: "Starting",
      attempt: 1,
      elapsedMs: 0,
    };
    const downstream: Analyst = {
      async *run() {
        yield expected;
      },
    };
    const downstreamRun = vi.spyOn(downstream, "run");
    const analyst = createGuardedAnalyst(downstream);

    await expect(collect(analyst, "What were total sales?")).resolves.toEqual([expected]);
    expect(downstreamRun).toHaveBeenCalledOnce();
  });
});
