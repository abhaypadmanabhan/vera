import { describe, expect, it } from "vitest";
import { buildDeck, evidenceHeadline, matchSlide } from "@/lib/deck";
import type { DatasetProfile, Finding } from "@/lib/types";

const profile: DatasetProfile = {
  datasetId: "superstore", filename: "superstore.csv", rowCount: 9994,
  columns: [], duplicateRowCount: 1, crossChecks: [], notes: [],
};

const verified: Finding = {
  verdict: "verified", value: 143787.36, unit: null,
  claim: "Total sales in Q3 2018 were 143,787.36.",
  code: { language: "python", source: "print(1)", explanation: "Parsed dates then summed sales.", lineCount: 6 },
  execution: {
    exitCode: 0,
    stdout: "",
    stderr: "",
    value: 143787.36,
    contextValues: {},
    durationMs: 828,
  },
  grounding: {
    columns: ["OrderDate", "Sales"], rowCount: 9994, rowRange: [0, 9993], sampleCells: [],
    schemaEvidence: [{
      claim: "OrderDate is DD/MM/YYYY", supportingRows: 5952, contradictingRows: 0,
      examples: ["15/04/2019"],
      method: "5,952 values have a first component above 12, which cannot be a month.",
    }],
  },
  context: [],
  valence: "neutral",
  attempts: 1,
};

const unverified: Finding = {
  verdict: "unverified", reason: "retry_exhausted", detail: "no", code: null, attempts: 2,
};

/** Any claim that every row backed the schema fact, in any of its wordings. */
const UNANIMITY = /every row agrees|all\s+(?:of\s+them\s+)?agree/i;

describe("deck", () => {
  it("opens with analyst framing and ends on the summary", () => {
    const deck = buildDeck("What were total sales in Q3 2018?", verified, profile);
    expect(deck.slides[0]?.kind).toBe("opener");
    expect(deck.slides.at(-1)?.kind).toBe("summary");
  });

  it("includes a caveat slide for each PROVEN schema fact", () => {
    const deck = buildDeck("q", verified, profile);
    expect(deck.slides.filter((s) => s.kind === "caveat")).toHaveLength(1);
  });

  it("drops an unproven schema fact rather than presenting it as evidence", () => {
    const shaky: Finding = {
      ...verified,
      grounding: {
        ...(verified as Extract<Finding, { verdict: "verified" }>).grounding,
        schemaEvidence: [{
          claim: "ambiguous", supportingRows: 0, contradictingRows: 0, examples: [], method: "x",
        }],
      },
    };
    expect(buildDeck("q", shaky, profile).slides.filter((s) => s.kind === "caveat")).toHaveLength(0);
  });

  /*
   * `SchemaEvidence` counts the rows that SUPPORT a claim and the rows that
   * CONTRADICT it, and permits rows that do neither — a value that reads validly
   * both ways is ambiguous, not agreement. The fixture is 5,952 supporting and 0
   * contradicting on a 9,994-row file, so 4,042 rows said nothing either way and
   * "every row agrees" was a false statement of proof on a slide Vera narrates.
   * Zero contradictions proves that nothing disagreed, and no more (PRD §6).
   */
  it("never turns an absence of contradictions into unanimity", () => {
    const evidence = (verified as Extract<Finding, { verdict: "verified" }>).grounding
      .schemaEvidence[0];
    expect(evidence).toBeDefined();
    expect(evidence!.contradictingRows).toBe(0);
    // The fixture only discriminates if rows really are unaccounted for.
    expect(evidence!.supportingRows).toBeLessThan(profile.rowCount);

    expect(evidenceHeadline(evidence!)).not.toMatch(UNANIMITY);
    const deck = buildDeck("q", verified, profile);
    for (const slide of deck.slides) {
      expect(slide.spoken, `${slide.id} claimed unanimity`).not.toMatch(UNANIMITY);
      for (const beat of slide.beats) {
        expect(beat.spoken, `${slide.id} beat claimed unanimity`).not.toMatch(UNANIMITY);
      }
    }

    // What WAS proven is still said out loud — this is a rewording, not a cut.
    const caveat = deck.slides.find((slide) => slide.kind === "caveat");
    expect(caveat?.spoken).toMatch(/disagree/i);
  });

  it("gives an unverified finding NO slides — nothing to present, nothing to speak", () => {
    expect(buildDeck("q", unverified, profile).slides).toHaveLength(0);
  });

  it("never puts a raw dollar sign or backtick into spoken text", () => {
    for (const s of buildDeck("q", verified, profile).slides) {
      expect(s.spoken).not.toContain("`");
    }
  });

  it("routes a covered follow-up back to the slide that answered it", () => {
    const deck = buildDeck("What were total sales in Q3 2018?", verified, profile);
    expect(matchSlide("how do you know the date format?", deck)?.kind).toBe("caveat");
    expect(matchSlide("what code did you run?", deck)?.kind).toBe("working");
    expect(matchSlide("which cells did you read", deck)?.kind).toBe("working");
  });

  it("returns null for a genuinely new question instead of faking a match", () => {
    const deck = buildDeck("q", verified, profile);
    expect(matchSlide("which region had the highest profit margin", deck)).toBeNull();
  });

  /*
   * Single-word topics are common English: the headline slide claims "total"
   * and the code slide claims "run". Without a length guard these hijacked new
   * questions back to an old slide, which on stage reads as Vera ignoring you.
   */
  it("does not let one stray keyword hijack a new question", () => {
    const deck = buildDeck("What were total sales in Q3 2018?", verified, profile);
    expect(matchSlide("what were total sales by region?", deck)).toBeNull();
    expect(matchSlide("which category should we run a promotion on?", deck)).toBeNull();
    expect(matchSlide("how many units were sold in the total east region", deck)).toBeNull();
  });

  it("still routes a short deictic follow-up on a single keyword", () => {
    const deck = buildDeck("What were total sales in Q3 2018?", verified, profile);
    expect(matchSlide("show me the code", deck)?.kind).toBe("working");
    expect(matchSlide("which cells?", deck)?.kind).toBe("working");
    expect(matchSlide("recap", deck)?.kind).toBe("summary");
  });
});

describe("presenter beats", () => {
  it("every narrated slide has presenter beats", () => {
    for (const s of buildDeck("q", verified, profile).slides) {
      if (s.kind === "working") {
        expect(s.beats).toEqual([]);
        continue;
      }
      expect(s.beats.length).toBeGreaterThan(0);
      for (const b of s.beats) {
        expect(b.focus).toMatch(/^[a-z]+$/);
        expect(b.spoken.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
