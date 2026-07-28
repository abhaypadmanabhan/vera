import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DeckPlayer,
  DeckSlide,
  needsFallbackPacing,
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

/**
 * The same rule `tests/deck-voice.test.ts` applies to narration, applied to what
 * a person actually sees. The snake_case clause is deliberately not anchored on
 * a word boundary: a leaked identifier arrives as `date_added`, and `\b_` never
 * matches in the middle of a token.
 */
const JARGON =
  /\b(column|pandas|python|dd\/mm|mm\/dd|day.first|month.first|format|parse[sd]?|dtype|csv)\b|[a-z0-9]+_[a-z0-9]+/i;

/** What the slide reads as out loud to someone looking at it — text, never attributes. */
function renderedText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("deck slide presentation", () => {
  /*
   * 328 tests passed while `date_added is DD/MM/YYYY` sat on the final slide,
   * because every one of them asserted against `slide.spoken` and never against
   * a rendered slide. This asserts the rendered text.
   */
  it("renders no code jargon on any narrated slide", () => {
    const contextFinding: Extract<Finding, { verdict: "verified" }> = {
      ...finding,
      context: [
        {
          name: "prior_period",
          description: "the same quarter a year earlier",
          value: 121004.2,
          columnsUsed: ["OrderDate", "Sales"],
        },
      ],
    };
    const deck = buildDeck("What were sales in Q3 2018?", contextFinding, profile);

    for (const slide of deck.slides) {
      if (slide.kind === "working") continue;
      const markup = renderToStaticMarkup(
        createElement(DeckSlide, {
          slide,
          finding: contextFinding,
          dataset,
          benchmark,
          activeFocus: slide.beats[0]?.focus ?? null,
        }),
      );

      expect(renderedText(markup), `${slide.id} rendered jargon`).not.toMatch(JARGON);
    }
  });

  it("paces a silent working slide even when voice is otherwise available", () => {
    const working = buildDeck("What were sales in Q3 2018?", finding, profile).slides.find(
      (slide) => slide.kind === "working",
    );
    expect(working).toBeDefined();
    expect(needsFallbackPacing(working!, true)).toBe(true);
  });

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

  it("keeps only proven technical evidence on the working slide", () => {
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
    const working = buildDeck("What were sales in Q3 2018?", mixedFinding, profile).slides.find(
      (slide) => slide.kind === "working",
    );
    expect(working).toBeDefined();

    const markup = renderToStaticMarkup(
      createElement(DeckSlide, {
        slide: working!,
        finding: mixedFinding,
        dataset,
        activeFocus: null,
      }),
    );

    expect(markup).toContain("OrderDate is DD/MM/YYYY");
    expect(markup).not.toContain("The first format guess");
  });

  it("renders every analyst slide kind with its existing presentation language", () => {
    const contextFinding: Extract<Finding, { verdict: "verified" }> = {
      ...finding,
      context: [
        {
          name: "prior_period",
          description: "the same quarter a year earlier",
          value: 121004.2,
          columnsUsed: ["OrderDate", "Sales"],
        },
      ],
    };
    const deck = buildDeck("What were sales in Q3 2018?", contextFinding, profile);

    expect(deck.slides.map((slide) => slide.kind)).toEqual([
      "opener",
      "finding",
      "meaning",
      "caveat",
      "working",
      "summary",
    ]);

    for (const slide of deck.slides) {
      const markup = renderToStaticMarkup(
        createElement(DeckSlide, {
          slide,
          finding: contextFinding,
          dataset,
          benchmark,
          activeFocus: slide.beats[0]?.focus ?? null,
        }),
      );
      expect(markup).toContain(`data-kind="${slide.kind}"`);
    }
  });

  /*
   * Found in the 2026-07-26 live run on an uploaded file. Schema evidence only
   * exists for a column carrying a proven deterministic inference — a date order,
   * a cross-check. A question that reads no such column has no evidence, which is
   * normal and honest. The summary slide rendered it as `0 Support · 0 Contradict
   * · 0 rows that agree` beneath a verified figure, which reads as "nothing in the
   * data agrees with this number" — the opposite of the claim being made.
   *
   * Same rule as the context figures: grounded or absent, never a hedge and never
   * a zero standing in for "not applicable".
   */
  it("shows no agreement counts when the answer rests on no proven schema claim", () => {
    const noEvidence: typeof finding = {
      ...finding,
      grounding: { ...finding.grounding, schemaEvidence: [] },
    };
    const summary = buildDeck(
      "What is the average duration in minutes for movies?",
      noEvidence,
      profile,
    ).slides.find((slide) => slide.kind === "summary");
    expect(summary).toBeDefined();

    const text = renderedText(
      renderToStaticMarkup(
        createElement(DeckSlide, {
          slide: summary!,
          finding: noEvidence,
          dataset,
          benchmark,
          activeFocus: "proof",
        }),
      ),
    );

    expect(text).not.toMatch(/rows that agree/i);
    expect(text).not.toMatch(/support/i);
    expect(text).not.toMatch(/contradict/i);
    // What is real still shows.
    expect(text).toMatch(/rows read/i);
  });

  it("still shows agreement counts when a proven schema claim backs the answer", () => {
    const summary = buildDeck(
      "What were sales in Q3 2018?",
      finding,
      profile,
    ).slides.find((slide) => slide.kind === "summary");
    const text = renderedText(
      renderToStaticMarkup(
        createElement(DeckSlide, {
          slide: summary!,
          finding,
          dataset,
          benchmark,
          activeFocus: "proof",
        }),
      ),
    );

    expect(text).toMatch(/rows that agree/i);
    expect(text).toMatch(/5,952/);
  });
});
