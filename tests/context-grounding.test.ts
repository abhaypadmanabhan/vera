import { describe, expect, it } from "vitest";
import { verifyContextFigures } from "@/lib/verify";
import type { DatasetProfile } from "@/lib/types";

const profile: DatasetProfile = {
  datasetId: "mini-business",
  filename: "mini-business.csv",
  rowCount: 3,
  duplicateRowCount: 0,
  crossChecks: [],
  notes: [],
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

const declared = [
  {
    name: "prior_period",
    description: "the same quarter a year earlier",
    columnsUsed: ["Sales"],
  },
  {
    name: "share",
    description: "its share of the year",
    columnsUsed: ["Sales"],
  },
];

describe("verifyContextFigures — grounded, or gone", () => {
  it("keeps a figure that executed and traces to a real column", () => {
    const kept = verifyContextFigures({
      declared,
      executed: { prior_period: 121004.2, share: 0.42 },
      profile,
    });
    expect(kept.map((figure) => figure.name)).toEqual([
      "prior_period",
      "share",
    ]);
    expect(kept[0]?.value).toBe(121004.2);
  });

  it("drops a declared figure the code never produced", () => {
    const kept = verifyContextFigures({
      declared,
      executed: { prior_period: 1 },
      profile,
    });
    expect(kept.map((figure) => figure.name)).toEqual(["prior_period"]);
  });

  it("drops an executed figure that was never declared — no undescribed number reaches the voice", () => {
    const kept = verifyContextFigures({
      declared,
      executed: { prior_period: 1, smuggled: 999 },
      profile,
    });
    expect(kept.some((figure) => figure.name === "smuggled")).toBe(false);
  });

  it("drops a figure claiming a column this file does not have", () => {
    const kept = verifyContextFigures({
      declared: [{ name: "x", description: "d", columnsUsed: ["Ghost"] }],
      executed: { x: 5 },
      profile,
    });
    expect(kept).toEqual([]);
  });

  it("drops a figure that reports no columns at all", () => {
    const kept = verifyContextFigures({
      declared: [{ name: "x", description: "d", columnsUsed: [] }],
      executed: { x: 5 },
      profile,
    });
    expect(kept).toEqual([]);
  });

  it("returns an empty array rather than throwing when nothing was declared", () => {
    expect(
      verifyContextFigures({ declared: [], executed: {}, profile }),
    ).toEqual([]);
  });
});
