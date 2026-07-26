import { describe, expect, it } from "vitest";
import { runDeckQuestions } from "@/app/api/analyze/route";
import type {
  AnalysisRequest,
  Analyst,
  DatasetProfile,
  Finding,
  ResolvedDataset,
  StageEvent,
} from "@/lib/types";

/**
 * The route's question driver. Default config is ONE finding per deck, and
 * with one it is exactly the old single analyst pass. Above one — the value
 * the builder turns up only after signing off on spend — follow-up questions
 * come from the free, guardrail-filtered suggestion machinery, and a failed
 * follow-up is swallowed rather than presented.
 */

const profile: DatasetProfile = {
  datasetId: "biz",
  filename: "biz.csv",
  rowCount: 10,
  columns: [
    {
      name: "sales",
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
    {
      name: "segment",
      kind: "category",
      nullCount: 0,
      distinctCount: 4,
      sampleValues: ["Consumer"],
      dateFormat: null,
      evidence: null,
    },
  ],
  duplicateRowCount: 0,
  crossChecks: [],
  notes: [],
};

const dataset: ResolvedDataset = {
  id: "biz",
  filename: "biz.csv",
  content: "sales,region,segment\n100,East,Consumer\n",
  profile,
};

const VERIFIED: Finding = {
  verdict: "verified",
  value: 100,
  unit: null,
  claim: "Total sales came to 100.",
  code: { language: "python", source: "print(1)", explanation: "Summed sales.", lineCount: 2 },
  execution: { exitCode: 0, stdout: "100", stderr: "", value: 100, contextValues: {}, durationMs: 1 },
  grounding: {
    columns: ["sales"],
    rowCount: 10,
    rowRange: [0, 9],
    sampleCells: [],
    schemaEvidence: [],
  },
  context: [],
  valence: "neutral",
  attempts: 1,
};

const UNVERIFIED: Finding = {
  verdict: "unverified",
  reason: "not_grounded",
  detail: "No trace.",
  code: null,
  attempts: 2,
};

/** An analyst stub that returns one queued finding per run, in order. */
function stubAnalyst(outcomes: Finding[], calls: string[]): Analyst {
  let run = 0;
  return {
    async *run(request: AnalysisRequest): AsyncIterable<StageEvent> {
      calls.push(request.question);
      const finding = outcomes[Math.min(run, outcomes.length - 1)];
      run += 1;
      if (finding) yield { type: "finding", finding, elapsedMs: 1 };
    },
  };
}

async function collect(
  analyst: Analyst,
  question: string,
  maxFindings: number,
): Promise<StageEvent[]> {
  const events: StageEvent[] = [];
  for await (const event of runDeckQuestions(
    analyst,
    { question, dataset },
    maxFindings,
  )) {
    events.push(event);
  }
  return events;
}

const findingEvents = (events: StageEvent[]): Finding[] =>
  events.flatMap((event) => (event.type === "finding" ? [event.finding] : []));

describe("runDeckQuestions — the money ceiling", () => {
  it("one finding (the default) is exactly the old single pass", async () => {
    const calls: string[] = [];
    const events = await collect(stubAnalyst([VERIFIED], calls), "What were total sales?", 1);

    expect(calls).toEqual(["What were total sales?"]);
    expect(findingEvents(events)).toEqual([VERIFIED]);
  });

  it("forwards the asked question's refusal unchanged, and spends nothing more", async () => {
    const calls: string[] = [];
    const events = await collect(stubAnalyst([UNVERIFIED], calls), "Why did sales drop?", 3);

    expect(calls).toEqual(["Why did sales drop?"]);
    expect(findingEvents(events)).toEqual([UNVERIFIED]);
  });

  it("clamps a nonsensical ceiling to one run, never zero and never negative", async () => {
    const calls: string[] = [];
    const events = await collect(stubAnalyst([VERIFIED], calls), "What were total sales?", 0);

    expect(calls).toEqual(["What were total sales?"]);
    expect(findingEvents(events)).toHaveLength(1);
  });
});

describe("runDeckQuestions — several findings", () => {
  it("runs follow-up questions from the suggestion machinery, in order, once each", async () => {
    const calls: string[] = [];
    const events = await collect(
      stubAnalyst([VERIFIED, VERIFIED, VERIFIED], calls),
      "What were total sales?",
      3,
    );

    expect(calls).toHaveLength(3);
    expect(calls[0]).toBe("What were total sales?");
    // The follow-ups are the questions Vera would have suggested anyway —
    // schema-derived, guardrail-filtered, and never the asked question twice.
    expect(new Set(calls).size).toBe(calls.length);
    for (const followUp of calls.slice(1)) {
      expect(followUp).not.toBe("What were total sales?");
      expect(followUp.length).toBeGreaterThan(0);
    }
    expect(findingEvents(events)).toEqual([VERIFIED, VERIFIED, VERIFIED]);
  });

  it("a failed follow-up is absent from the stream — no hedge, and the run stops", async () => {
    const calls: string[] = [];
    const events = await collect(
      stubAnalyst([VERIFIED, UNVERIFIED, VERIFIED], calls),
      "What were total sales?",
      3,
    );

    // The failed follow-up cost one run and produced NOTHING: no finding
    // event, no third question spending more on a broken thread.
    expect(calls).toHaveLength(2);
    expect(findingEvents(events)).toEqual([VERIFIED]);
    expect(
      events.some(
        (event) => event.type === "finding" && event.finding.verdict !== "verified",
      ),
    ).toBe(false);
  });

  it("stops early when there is nothing new left to ask", async () => {
    const noDimensions: AnalysisRequest = {
      question: "What were total sales?",
      dataset: {
        ...dataset,
        profile: { ...profile, columns: profile.columns.slice(0, 1) },
      },
    };
    const calls: string[] = [];
    const analyst = stubAnalyst([VERIFIED, VERIFIED], calls);
    const events: StageEvent[] = [];
    for await (const event of runDeckQuestions(analyst, noDimensions, 5)) {
      events.push(event);
    }

    expect(calls).toEqual(["What were total sales?"]);
    expect(findingEvents(events)).toEqual([VERIFIED]);
  });
});
