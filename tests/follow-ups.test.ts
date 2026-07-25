import { describe, expect, it } from "vitest";
import { suggestFollowUps } from "../lib/follow-ups";
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
  execution: { exitCode: 0, stdout: "", stderr: "", value: 143787.36, durationMs: 820 },
  grounding: {
    columns: ["Sales", "OrderDate"],
    rowCount: 9994,
    rowRange: [0, 9993],
    sampleCells: [],
    schemaEvidence: [],
  },
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
    const noMeasure: DatasetProfile = {
      ...profile,
      columns: [column({ name: "Region", distinctCount: 4 })],
    };

    expect(suggestFollowUps(verified, noMeasure)).toEqual([]);
  });
});
