import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { suggestFollowUps } from "../lib/follow-ups";
import { classifyQuestion } from "../lib/guardrails/classify";
import { profileDataset } from "../lib/profile/profiler";
import type { ColumnProfile, DatasetProfile, Finding } from "../lib/types";

function column(partial: Partial<ColumnProfile> & { name: string }): ColumnProfile {
  return {
    kind: "category",
    nullCount: 0,
    distinctCount: 4,
    sampleValues: [],
    dateFormat: null,
    evidence: null,
    ...partial,
  };
}

const profile: DatasetProfile = {
  datasetId: "superstore",
  filename: "superstore.csv",
  rowCount: 9994,
  duplicateRowCount: 0,
  crossChecks: [],
  notes: [],
  columns: [
    column({ name: "Sales", kind: "number", distinctCount: 5000 }),
    column({ name: "Region", distinctCount: 4 }),
    column({ name: "Category", distinctCount: 3 }),
    column({ name: "OrderDate", kind: "date", dateFormat: "%d/%m/%Y" }),
    column({ name: "OrderID", kind: "id", distinctCount: 5009 }),
  ],
};

const verified: Finding = {
  verdict: "verified",
  value: 143787.36,
  unit: null,
  claim: "Sales came to 143,787.36 dollars.",
  code: { language: "python", source: "print(1)", explanation: "Sums Sales.", lineCount: 3 },
  execution: {
    exitCode: 0,
    stdout: "",
    stderr: "",
    value: 143787.36,
    contextValues: {},
    durationMs: 820,
  },
  grounding: {
    columns: ["Sales", "OrderDate"],
    rowCount: 9994,
    rowRange: [0, 9993],
    sampleCells: [],
    schemaEvidence: [],
  },
  context: [],
  valence: "neutral",
  attempts: 1,
};

describe("suggestFollowUps", () => {
  it("proposes questions that continue the same measure", () => {
    const suggestions = suggestFollowUps(verified, profile);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.toLowerCase().includes("sales"))).toBe(true);
  });

  it("never proposes a breakdown by a column the answer already used", () => {
    const suggestions = suggestFollowUps(verified, profile).join(" ").toLowerCase();

    // OrderDate was in the grounding, so "which order date had the highest…" is noise.
    expect(suggestions).not.toContain("which order date");
  });

  it("uses plain English, never a raw column identifier", () => {
    const withUgly: DatasetProfile = {
      ...profile,
      columns: [
        column({ name: "net_sales_usd", kind: "number", distinctCount: 900 }),
        column({ name: "ship_region", distinctCount: 4 }),
      ],
    };
    const finding: Finding = {
      ...verified,
      grounding: { ...verified.grounding, columns: ["net_sales_usd"] },
    };

    const suggestions = suggestFollowUps(finding, withUgly).join(" ");

    expect(suggestions).not.toContain("net_sales_usd");
    expect(suggestions).not.toContain("ship_region");
    expect(suggestions.toLowerCase()).toContain("net sales usd");
  });

  it("offers nothing after a refusal — there is no thread to continue", () => {
    const unverified: Finding = {
      verdict: "unverified",
      reason: "null_result",
      detail: "The code produced no usable value.",
      code: null,
      attempts: 1,
    };

    expect(suggestFollowUps(unverified, profile)).toEqual([]);
  });

  it("skips high-cardinality columns that would produce an unreadable breakdown", () => {
    const suggestions = suggestFollowUps(verified, profile).join(" ").toLowerCase();

    expect(suggestions).not.toContain("order id");
  });

  it("shows at most three, and never a duplicate", () => {
    const suggestions = suggestFollowUps(verified, profile);

    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });

  it("only proposes questions the guardrail would let through", () => {
    // A suggestion is a promise: offering something Vera then refuses is worse
    // than offering nothing.
    const suggestions = suggestFollowUps(verified, profile);
    for (const suggestion of suggestions) {
      expect(classifyQuestion(suggestion, profile).allowed).toBe(true);
    }
  });

  it("falls back to counting when the file has nothing honest to aggregate", () => {
    // Previously this asserted an empty list; the task now requires
    // count-shaped questions instead of silence when no measure exists.
    const noMeasure: DatasetProfile = {
      ...profile,
      columns: [column({ name: "Region", distinctCount: 4 })],
    };

    const suggestions = suggestFollowUps(verified, noMeasure);

    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.toLowerCase()).toMatch(/how many|has the most/);
      expect(classifyQuestion(suggestion, noMeasure).allowed).toBe(true);
    }
  });

  it("a genuine measure still earns a breakdown, a comparison and a share", () => {
    const suggestions = suggestFollowUps(verified, profile);

    expect(suggestions).toContain("Which region had the highest sales?");
    expect(suggestions).toContain("How did sales change year over year?");
    expect(suggestions).toContain("What share of sales came from the top category?");
  });

  it("a genuine duration measure still earns a breakdown, a comparison and a share", () => {
    const durationProfile: DatasetProfile = {
      datasetId: "movies",
      filename: "movies.csv",
      rowCount: 500,
      duplicateRowCount: 0,
      crossChecks: [],
      notes: [],
      columns: [
        column({
          name: "duration_minutes",
          kind: "integer",
          distinctCount: 120,
          sampleValues: ["90", "95", "120", "104", "88"],
        }),
        column({ name: "genre", distinctCount: 8 }),
        column({ name: "rating", distinctCount: 5 }),
        column({ name: "added_on", kind: "date", dateFormat: "%Y-%m-%d" }),
      ],
    };
    const finding: Finding = {
      ...verified,
      grounding: { ...verified.grounding, columns: ["duration_minutes"] },
    };

    const suggestions = suggestFollowUps(finding, durationProfile);

    expect(suggestions).toContain("Which genre had the highest duration minutes?");
    expect(suggestions).toContain("How did duration minutes change year over year?");
    expect(suggestions).toContain(
      "What share of duration minutes came from the top rating?",
    );
  });
});

describe("suggestFollowUps on a Netflix-shaped file", () => {
  // Mirrors tests/fixtures/netflix-titles.csv: the only integers are a year
  // and an identifier-shaped sequence, so there is nothing honest to total.
  const netflixProfile: DatasetProfile = {
    datasetId: "netflix",
    filename: "netflix-titles.csv",
    rowCount: 8807,
    duplicateRowCount: 0,
    crossChecks: [],
    notes: [],
    columns: [
      column({ name: "show_id", kind: "id", distinctCount: 8807 }),
      column({ name: "type", distinctCount: 2, sampleValues: ["Movie", "TV Show"] }),
      column({ name: "title", kind: "text", distinctCount: 8800 }),
      column({ name: "country", distinctCount: 30, sampleValues: ["United States", "India"] }),
      column({ name: "date_added", kind: "date", dateFormat: "%d/%m/%Y" }),
      column({
        name: "release_year",
        kind: "integer",
        distinctCount: 74,
        sampleValues: ["2020", "2021", "2019", "2018", "2017"],
      }),
      column({ name: "rating", distinctCount: 14, sampleValues: ["PG-13", "TV-MA"] }),
    ],
  };

  const netflixFinding: Finding = {
    ...verified,
    grounding: { ...verified.grounding, columns: ["release_year", "type"] },
  };

  it("never totals a year, however the question is phrased", () => {
    const suggestions = suggestFollowUps(netflixFinding, netflixProfile);

    // The three sentences observed on stage 2026-07-26 can never come back.
    expect(suggestions).not.toContain("Which country had the highest release year?");
    expect(suggestions).not.toContain("How did release year change year over year?");
    expect(suggestions).not.toContain(
      "What share of release year came from the top rating?",
    );
    expect(suggestions.join(" ").toLowerCase()).not.toContain("release year");
  });

  it("proposes count-shaped questions instead, named after the file", () => {
    const suggestions = suggestFollowUps(netflixFinding, netflixProfile);

    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.toLowerCase()).toMatch(/how many titles|has the most titles/);
      expect(classifyQuestion(suggestion, netflixProfile).allowed).toBe(true);
    }
  });

  it("never totals a number that only a value-shape exposes as a label", () => {
    // No telling names: "released" holds years, "seq" is one value per row,
    // "stars" is a five-point scale. None may be summed, compared or shared.
    const shapeProfile: DatasetProfile = {
      ...netflixProfile,
      filename: "watchlog.csv",
      columns: [
        column({
          name: "released",
          kind: "integer",
          distinctCount: 60,
          sampleValues: ["1999", "2004", "2011", "2016", "2022"],
        }),
        column({
          name: "seq",
          kind: "integer",
          distinctCount: 8807,
          sampleValues: ["10432", "10433", "10434", "10435", "10436"],
        }),
        column({
          name: "stars",
          kind: "integer",
          distinctCount: 5,
          sampleValues: ["3", "4", "5", "2", "1"],
        }),
        column({ name: "genre", distinctCount: 9 }),
      ],
    };
    const finding: Finding = {
      ...verified,
      grounding: { ...verified.grounding, columns: ["released"] },
    };

    const suggestions = suggestFollowUps(finding, shapeProfile);
    const text = suggestions.join(" ").toLowerCase();

    expect(text).not.toContain("released");
    expect(text).not.toContain("seq");
    expect(text).not.toContain("stars");
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(classifyQuestion(suggestion, shapeProfile).allowed).toBe(true);
    }
  });

  /*
   * Macroscope on PR #42. The identifier ratio was measured against every row,
   * including the empty ones, so a key with nulls looked like a quantity: 90
   * distinct values over 100 rows is 0.90, under the 0.95 threshold, even
   * though every populated row holds a unique value. `seq` was then totalled
   * and compared — "Which genre had the highest seq?".
   */
  it("reads a sparsely populated integer key as an identifier, not a quantity", () => {
    const sparseKeyProfile: DatasetProfile = {
      ...netflixProfile,
      filename: "watchlog.csv",
      rowCount: 100,
      columns: [
        column({
          name: "seq",
          kind: "integer",
          nullCount: 10,
          distinctCount: 90,
          sampleValues: ["10432", "10433", "10434", "10435", "10436"],
        }),
        column({ name: "genre", distinctCount: 9 }),
      ],
    };
    const finding: Finding = {
      ...verified,
      grounding: { ...verified.grounding, columns: ["seq"] },
    };

    const suggestions = suggestFollowUps(finding, sparseKeyProfile);

    expect(suggestions.join(" ").toLowerCase()).not.toContain("seq");
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(classifyQuestion(suggestion, sparseKeyProfile).allowed).toBe(true);
    }
  });

  it("counts rows when the filename offers no honest noun", () => {
    const bareProfile: DatasetProfile = {
      ...netflixProfile,
      filename: "superstore.csv",
    };

    const suggestions = suggestFollowUps(netflixFinding, bareProfile);

    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.toLowerCase()).toMatch(/how many rows|has the most rows/);
    }
  });
});

describe("suggestFollowUps on the real Netflix fixture, real profiler", () => {
  // Nothing here is hand-built: the actual CSV goes through profileDataset,
  // so a year that slips past the profiler is caught here, not in a fixture.
  const csv = readFileSync(join(__dirname, "fixtures", "netflix-titles.csv"), "utf8");
  const realProfile = profileDataset("netflix", "netflix-titles.csv", csv);

  const realFinding: Finding = {
    ...verified,
    claim: "12 titles were released in 2020.",
    grounding: {
      ...verified.grounding,
      columns: ["release_year", "type"],
      rowCount: realProfile.rowCount,
      rowRange: [0, realProfile.rowCount - 1],
    },
  };

  it("profiles release_year as an integer and still never totals it", () => {
    const releaseYear = realProfile.columns.find((c) => c.name === "release_year");
    expect(releaseYear?.kind).toBe("integer");

    const suggestions = suggestFollowUps(realFinding, realProfile);
    const text = suggestions.join(" ").toLowerCase();

    expect(text).not.toContain("release year");
    expect(suggestions).not.toContain("Which country had the highest release year?");
    expect(suggestions).not.toContain("How did release year change year over year?");
    expect(suggestions).not.toContain(
      "What share of release year came from the top rating?",
    );
    for (const suggestion of suggestions) {
      expect(classifyQuestion(suggestion, realProfile).allowed).toBe(true);
    }

    // Visible in the test output as the human-checkable proof.
    console.log("real-fixture suggestions:", JSON.stringify(suggestions, null, 2));
  });
});
