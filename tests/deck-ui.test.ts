import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DeckPlayer,
  DeckSlide,
  presenterPosition,
} from "@/components/vera/deck-player";
import { buildDeck } from "@/lib/deck";
import type { DatasetProfile, DatasetSummary, Finding } from "@/lib/types";

const profile: DatasetProfile = {
  datasetId: "superstore",
  filename: "superstore.csv",
  rowCount: 9994,
  columns: [],
  duplicateRowCount: 1,
  crossChecks: [],
  notes: [],
};

const dataset: DatasetSummary = {
  id: "superstore",
  filename: "superstore.csv",
  rowCount: 9994,
  columns: [],
  duplicateRowCount: 1,
  notes: [],
  previewRows: [
    ["CA-2018-1001", "27/03/2018", "249.90"],
    ["CA-2018-1002", "19/08/2018", "892.10"],
  ],
  sizeBytes: 2_300_000,
};

const finding: Extract<Finding, { verdict: "verified" }> = {
  verdict: "verified",
  value: 143787.36,
  unit: "$",
  claim: "Q3 2018 sales, computed from the corrected dates.",
  code: {
    language: "python",
    source: "df = pd.read_csv(path)\ndf['OrderDate'] = pd.to_datetime(df['OrderDate'], dayfirst=True)\nprint(df['Sales'].sum())",
    explanation: "Parsed the proven day-first dates, then summed Sales.",
    lineCount: 3,
  },
  execution: {
    exitCode: 0,
    stdout: "143787.36",
    stderr: "",
    value: 143787.36,
    contextValues: {},
    durationMs: 828,
  },
  grounding: {
    columns: ["OrderDate", "Sales"],
    rowCount: 9994,
    rowRange: [0, 9993],
    sampleCells: [
      { row: 120, column: "OrderDate", value: "27/03/2018" },
      { row: 120, column: "Sales", value: "249.90" },
    ],
    schemaEvidence: [
      {
        claim: "OrderDate is DD/MM/YYYY",
        supportingRows: 5952,
        contradictingRows: 0,
        examples: ["27/03/2018", "19/08/2018", "31/12/2018"],
        method: "5,952 values have a first component above 12, which cannot be a month.",
      },
    ],
  },
  context: [],
  valence: "neutral",
  attempts: 1,
};

const benchmark = {
  veraPercent: 100,
  baselinePercent: 47.6,
  dashboardUrl: "https://www.braintrust.dev/app/vera-benchmark",
  baselineMisses: ["What was total profit?"],
};

describe("deck slide presentation", () => {
  it("keeps the presenter clear of a focused figure when there is room beside it", () => {
    const position = presenterPosition(
      { left: 0, top: 0, width: 1440, height: 708 },
      { left: 80, right: 1180, top: 180, height: 180 },
    );

    expect(position.x).toBeGreaterThanOrEqual(1256);
    expect(position.x + 60).toBeLessThanOrEqual(1424);
    expect(position.y).toBeGreaterThanOrEqual(76);
    expect(position.y).toBeLessThanOrEqual(632);
  });

  it("offers an accessible narration stop control with its keyboard shortcuts", () => {
    const deck = buildDeck("What were sales in Q3 2018?", finding, profile);
    const markup = renderToStaticMarkup(
      createElement(DeckPlayer, {
        deck,
        finding,
        dataset,
        benchmark,
        isMock: false,
        onNewQuestion: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="Stop narration"');
    expect(markup).toContain("Stop");
    expect(markup).toContain("Esc");
    expect(markup).toContain("Space");
  });

  it("renders every beat focus as a focusable presentation region", () => {
    const deck = buildDeck("What were sales in Q3 2018?", finding, profile);

    for (const slide of deck.slides) {
      const markup = renderToStaticMarkup(
        createElement(DeckSlide, {
          slide,
          finding,
          dataset,
          activeFocus: slide.beats[0]?.focus ?? null,
        }),
      );

      for (const beat of slide.beats) {
        expect(markup).toContain(`data-focus="${beat.focus}"`);
      }
    }
  });

  it("tells the presenter orb's three states apart, and hides it from the reader", () => {
    const slide = buildDeck("What were sales in Q3 2018?", finding, profile).slides[0];
    const render = (speaking: boolean, narrating: boolean) =>
      renderToStaticMarkup(
        createElement(DeckSlide, {
          slide,
          finding,
          dataset,
          activeFocus: slide.beats[0]?.focus ?? null,
          speaking,
          narrating,
        }),
      );

    expect(render(true, true)).toContain('data-state="speaking"');
    expect(render(false, true)).toContain('data-state="idle"');
    expect(render(false, false)).toContain('data-state="stopped"');

    // The shader only mounts in the browser, so the static ring is what the
    // server renders — and it is what reduced motion is left with.
    expect(render(true, true)).toContain("presenter-orb-still");
    expect(render(true, true)).toContain("aria-hidden");
  });

  it("keeps the benchmark explicitly separate from the live proof", () => {
    const summary = buildDeck("What were sales in Q3 2018?", finding, profile).slides.at(-1);
    expect(summary).toBeDefined();

    const markup = renderToStaticMarkup(
      createElement(DeckSlide, {
        slide: summary!,
        finding,
        dataset,
        benchmark,
        activeFocus: "proof",
      }),
    );

    expect(markup).toContain("Pre-computed aggregate benchmark");
    expect(markup).toContain("100%");
    expect(markup).toContain("47.6%");
    expect(markup).toContain("What was total profit?");
    expect(markup).toContain("https://www.braintrust.dev/app/vera-benchmark");
    expect(markup).toContain("computed and traceable");
  });

  it("never renders an unproven fact when trap numbering skips it", () => {
    const mixedFinding: Extract<Finding, { verdict: "verified" }> = {
      ...finding,
      grounding: {
        ...finding.grounding,
        schemaEvidence: [
          {
            claim: "The first format guess",
            supportingRows: 0,
            contradictingRows: 0,
            examples: ["01/02/2018"],
            method: "The values are ambiguous.",
          },
          ...finding.grounding.schemaEvidence,
        ],
      },
    };
    const trap = buildDeck("What were sales in Q3 2018?", mixedFinding, profile).slides.find(
      (slide) => slide.kind === "trap",
    );
    expect(trap).toBeDefined();

    const markup = renderToStaticMarkup(
      createElement(DeckSlide, {
        slide: trap!,
        finding: mixedFinding,
        dataset,
        activeFocus: "claim",
      }),
    );

    expect(markup).toContain("The dates were day-first.");
    expect(markup).not.toContain("The first format guess");
  });
});
