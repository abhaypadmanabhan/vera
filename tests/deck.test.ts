import { describe, expect, it } from "vitest";
import { buildDeck, matchSlide } from "@/lib/deck";
import type { DatasetProfile, Finding } from "@/lib/types";

const profile: DatasetProfile = {
  datasetId: "superstore", filename: "superstore.csv", rowCount: 9994,
  columns: [], duplicateRowCount: 1, crossChecks: [], notes: [],
};

const verified: Finding = {
  verdict: "verified", value: 143787.36, unit: null,
  claim: "Total sales in Q3 2018 were 143,787.36.",
  code: { language: "python", source: "print(1)", explanation: "Parsed dates then summed sales.", lineCount: 6 },
  execution: { exitCode: 0, stdout: "", stderr: "", value: 143787.36, durationMs: 828 },
  grounding: {
    columns: ["OrderDate", "Sales"], rowCount: 9994, rowRange: [0, 9993], sampleCells: [],
    schemaEvidence: [{
      claim: "OrderDate is DD/MM/YYYY", supportingRows: 5952, contradictingRows: 0,
      examples: ["15/04/2019"],
      method: "5,952 values have a first component above 12, which cannot be a month.",
    }],
  },
  attempts: 1,
};

const unverified: Finding = {
  verdict: "unverified", reason: "retry_exhausted", detail: "no", code: null, attempts: 2,
};

describe("deck", () => {
  it("opens on the question and ends on the summary", () => {
    const deck = buildDeck("What were total sales in Q3 2018?", verified, profile);
    expect(deck.slides[0]?.kind).toBe("question");
    expect(deck.slides.at(-1)?.kind).toBe("summary");
  });

  it("includes a trap slide for each PROVEN schema fact", () => {
    const deck = buildDeck("q", verified, profile);
    expect(deck.slides.filter((s) => s.kind === "trap")).toHaveLength(1);
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
    expect(buildDeck("q", shaky, profile).slides.filter((s) => s.kind === "trap")).toHaveLength(0);
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
    expect(matchSlide("how do you know the date format?", deck)?.kind).toBe("trap");
    expect(matchSlide("what code did you run?", deck)?.kind).toBe("code");
    expect(matchSlide("which cells did you read", deck)?.kind).toBe("cells");
  });

  it("returns null for a genuinely new question instead of faking a match", () => {
    const deck = buildDeck("q", verified, profile);
    expect(matchSlide("which region had the highest profit margin", deck)).toBeNull();
  });
});
