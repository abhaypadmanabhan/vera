import { describe, expect, it } from "vitest";
import { buildDeck } from "@/lib/deck";
import { verifyContextFigures } from "@/lib/verify";
import type {
  ContextFigure,
  DatasetProfile,
  Finding,
  SchemaEvidence,
  Valence,
} from "@/lib/types";

const JARGON =
  /\b(column|pandas|python|dd\/mm|mm\/dd|day.first|month.first|format|parse[sd]?|row count|dtype|csv)\b/i;

const PROFILE: DatasetProfile = {
  datasetId: "superstore",
  filename: "superstore.csv",
  rowCount: 9994,
  columns: [],
  duplicateRowCount: 1,
  crossChecks: [],
  notes: [],
};

const EVIDENCE: SchemaEvidence = {
  claim: "OrderDate is DD/MM/YYYY",
  supportingRows: 5952,
  contradictingRows: 0,
  examples: ["15/04/2019"],
  method: "5,952 values have a first component above 12, which cannot be a month.",
};

const PRIOR_PERIOD: ContextFigure = {
  name: "prior_period",
  description: "the same quarter a year earlier",
  value: 121004.2,
  columnsUsed: ["OrderDate", "Sales"],
};

/**
 * The comparison as the program computed it: one named figure, its own value,
 * described so the figure reads in front of it.
 */
const CHANGE_ON_PRIOR: ContextFigure = {
  name: "change_on_prior_period",
  description: "higher than the same quarter a year earlier",
  value: "19%",
  columnsUsed: ["OrderDate", "Sales"],
};

const VERIFIED: Extract<Finding, { verdict: "verified" }> = {
  verdict: "verified",
  value: 143787.36,
  unit: null,
  claim: "Total sales in Q3 2018 were 143,787.36.",
  code: {
    language: "python",
    source: "print(1)",
    explanation: "Parsed dates then summed sales.",
    lineCount: 6,
  },
  execution: {
    exitCode: 0,
    stdout: "",
    stderr: "",
    value: 143787.36,
    contextValues: {},
    durationMs: 828,
  },
  grounding: {
    columns: ["OrderDate", "Sales"],
    rowCount: 9994,
    rowRange: [0, 9993],
    sampleCells: [],
    schemaEvidence: [],
  },
  context: [],
  valence: "neutral",
  attempts: 1,
};

const VERIFIED_WITH_EVIDENCE: Extract<Finding, { verdict: "verified" }> = {
  ...VERIFIED,
  grounding: {
    ...VERIFIED.grounding,
    schemaEvidence: [EVIDENCE],
  },
};

const UNVERIFIED: Finding = {
  verdict: "unverified",
  reason: "retry_exhausted",
  detail: "No grounded result.",
  code: null,
  attempts: 2,
};

describe("the deck speaks like an analyst", () => {
  it("opens on the finding, never on how many rows were read", () => {
    const deck = buildDeck("What were sales in Q3 2018?", VERIFIED, PROFILE);
    expect(deck.slides[0]?.kind).toBe("opener");
    expect(deck.slides[0]?.spoken).not.toMatch(/\d{1,3}(,\d{3})+ rows/);
    expect(deck.slides[1]?.kind).toBe("finding");
  });

  it("opens differently depending on the tone of the finding", () => {
    const bad =
      buildDeck("q", { ...VERIFIED, valence: "bad" }, PROFILE).slides[0]?.spoken ?? "";
    const good =
      buildDeck("q", { ...VERIFIED, valence: "good" }, PROFILE).slides[0]?.spoken ?? "";
    expect(bad).not.toBe(good);
    expect(bad).not.toMatch(/\d/);
  });

  /*
   * Three tails on one stem is a template, and it reads as one. Each valence
   * has to start somewhere different, not arrive somewhere different.
   */
  it("opens three different ways rather than one stem with three tails", () => {
    const openers = (["good", "bad", "neutral"] as const).map(
      (valence: Valence) =>
        buildDeck("q", { ...VERIFIED, valence }, PROFILE).slides[0]?.spoken ?? "",
    );

    const leadingClauses = openers.map((line) =>
      (line.split(/[,.;:—]/)[0] ?? "").trim().toLowerCase(),
    );
    expect(new Set(leadingClauses).size, `shared clause: ${leadingClauses.join(" | ")}`).toBe(3);

    const firstWords = openers.map((line) => (line.split(/\s+/)[0] ?? "").toLowerCase());
    expect(new Set(firstWords).size, `shared opening word: ${firstWords.join(" | ")}`).toBe(3);
  });

  it("says what it means when a context figure survived", () => {
    const deck = buildDeck("q", { ...VERIFIED, context: [PRIOR_PERIOD] }, PROFILE);
    const meaning = deck.slides.find((slide) => slide.kind === "meaning");
    expect(meaning?.spoken).toContain("the same quarter a year earlier");
  });

  /*
   * An analyst says "up nineteen percent on the quarter before", not "the other
   * number is 121,004.20". The delta is only ever sayable because the generated
   * program computed it and grounding kept it — TypeScript never subtracts one
   * verified number from another and speaks the result.
   */
  it("speaks the change itself when the program computed one", () => {
    const deck = buildDeck("q", { ...VERIFIED, context: [CHANGE_ON_PRIOR] }, PROFILE);
    const meaning = deck.slides.find((slide) => slide.kind === "meaning");

    expect(meaning?.spoken).toContain(
      "That is 19 percent higher than the same quarter a year earlier",
    );
    expect(meaning?.spoken).not.toContain("Set against");
    expect(meaning?.subtitle).toContain("19%");
  });

  it("falls back to setting the figure against a plain comparable", () => {
    const deck = buildDeck("q", { ...VERIFIED, context: [PRIOR_PERIOD] }, PROFILE);
    const meaning = deck.slides.find((slide) => slide.kind === "meaning");

    expect(meaning?.spoken).toContain(
      "Set against the same quarter a year earlier, that is 121,004.2",
    );
  });

  it("has NO meaning slide when nothing survived grounding", () => {
    const deck = buildDeck("q", { ...VERIFIED, context: [] }, PROFILE);
    expect(deck.slides.some((slide) => slide.kind === "meaning")).toBe(false);
  });

  /*
   * The end-to-end version of the rule above: a change the program declared but
   * never printed is dropped by grounding, and a dropped figure leaves no slide
   * behind for Vera to improvise over.
   */
  it("has NO meaning slide when the declared change never executed", () => {
    const profileWithColumns: DatasetProfile = {
      ...PROFILE,
      columns: [
        {
          name: "Sales",
          kind: "number",
          nullCount: 0,
          distinctCount: 3,
          sampleValues: ["10", "20", "30"],
          dateFormat: null,
          evidence: null,
        },
      ],
    };
    const grounded = verifyContextFigures({
      declared: [
        {
          name: "change_on_prior_period",
          description: "higher than the same quarter a year earlier",
          columnsUsed: ["Sales"],
        },
      ],
      executed: {},
      profile: profileWithColumns,
    });

    expect(grounded).toEqual([]);
    const deck = buildDeck("q", { ...VERIFIED, context: grounded }, profileWithColumns);
    expect(deck.slides.some((slide) => slide.kind === "meaning")).toBe(false);
  });

  it("states a caveat as a consequence, never as a method", () => {
    const deck = buildDeck("q", VERIFIED_WITH_EVIDENCE, PROFILE);
    const caveat = deck.slides.find((slide) => slide.kind === "caveat");
    expect(caveat?.spoken).toBeTruthy();
    expect(caveat?.spoken ?? "").not.toMatch(JARGON);
  });

  it("keeps every narrated line free of code jargon", () => {
    const deck = buildDeck("q", VERIFIED_WITH_EVIDENCE, PROFILE);
    for (const slide of deck.slides) {
      if (slide.kind === "working") continue;
      expect(slide.spoken, `${slide.id} spoke jargon`).not.toMatch(JARGON);
      for (const beat of slide.beats) {
        expect(beat.spoken, `${slide.id} beat`).not.toMatch(JARGON);
      }
    }
  });

  it("does not narrate the working slide, but keeps it in the deck", () => {
    const deck = buildDeck("q", VERIFIED, PROFILE);
    const working = deck.slides.find((slide) => slide.kind === "working");
    expect(working).toBeTruthy();
    expect(working?.beats).toEqual([]);
  });

  it("gives an unverified finding no deck at all", () => {
    expect(buildDeck("q", UNVERIFIED, PROFILE).slides).toEqual([]);
  });
});
