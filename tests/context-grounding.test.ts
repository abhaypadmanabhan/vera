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

/*
 * Macroscope on PR #41, deferred out of the codegen slice and closed here.
 *
 * "Every column it claims exists in this file" was never the claim being made.
 * A context figure could name any real column of the CSV, have been computed
 * from none of it, and still be printed beside the headline as though the code
 * had read it. `groundedColumns` is what the FINDING was verified against, so
 * a figure has to be part of the run that produced the number, not merely
 * consistent with the file's schema.
 */
describe("a context figure must belong to the run, not just the file", () => {
  const twoColumnProfile: DatasetProfile = {
    ...profile,
    columns: [
      ...profile.columns,
      {
        name: "Profit",
        kind: "number",
        nullCount: 0,
        distinctCount: 3,
        sampleValues: ["1", "2", "3"],
        dateFormat: null,
        evidence: null,
      },
    ],
  };

  const citesProfit = [
    {
      name: "margin",
      description: "the margin behind it",
      columnsUsed: ["Profit"],
    },
  ];

  it("drops a figure citing a real column the run never read", () => {
    const kept = verifyContextFigures({
      declared: citesProfit,
      executed: { margin: 0.12 },
      profile: twoColumnProfile,
      groundedColumns: ["Sales"],
    });

    expect(kept).toEqual([]);
  });

  it("keeps it when the run did read that column", () => {
    const kept = verifyContextFigures({
      declared: citesProfit,
      executed: { margin: 0.12 },
      profile: twoColumnProfile,
      groundedColumns: ["Sales", "Profit"],
    });

    expect(kept.map((figure) => figure.name)).toEqual(["margin"]);
  });
});
