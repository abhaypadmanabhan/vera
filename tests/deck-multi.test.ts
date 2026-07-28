import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeckSlide } from "@/components/vera/deck-player";
import { buildDeck, matchSlide } from "@/lib/deck";
import type { Deck, VerifiedFinding } from "@/lib/deck";
import type { DatasetProfile, DatasetSummary, Finding, SchemaEvidence } from "@/lib/types";

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
  previewRows: [["CA-2018-1001", "27/03/2018", "249.90"]],
  sizeBytes: 2_300_000,
};

const benchmark = {
  veraPercent: 100,
  baselinePercent: 47.6,
  dashboardUrl: "https://www.braintrust.dev/app/vera-benchmark",
  baselineMisses: ["What was total profit?"],
};

const EVIDENCE: SchemaEvidence = {
  claim: "OrderDate is DD/MM/YYYY",
  supportingRows: 5952,
  contradictingRows: 0,
  examples: ["27/03/2018"],
  method: "5,952 values have a first component above 12, which cannot be a month.",
};

/**
 * Two independently grounded findings, the shape the Netflix live run produced:
 * one headline figure with context and proven schema evidence, one plain one.
 * Every fixture figure is "executed" by its own finding's own run — the deck
 * may repeat one, it may never invent one.
 */
const FINDING_A: VerifiedFinding = {
  verdict: "verified",
  value: 143787.36,
  unit: null,
  claim: "Total sales in Q3 2018 came to this figure.",
  code: { language: "python", source: "print(1)", explanation: "Parsed dates then summed sales.", lineCount: 6 },
  execution: { exitCode: 0, stdout: "143787.36", stderr: "", value: 143787.36, contextValues: {}, durationMs: 828 },
  grounding: {
    columns: ["OrderDate", "Sales"],
    rowCount: 9994,
    rowRange: [0, 9993],
    sampleCells: [{ row: 120, column: "Sales", value: "249.90" }],
    schemaEvidence: [EVIDENCE],
  },
  context: [
    {
      name: "prior_period",
      description: "the same quarter a year earlier",
      value: 121004.2,
      columnsUsed: ["OrderDate", "Sales"],
    },
  ],
  valence: "neutral",
  attempts: 1,
};

const FINDING_B: VerifiedFinding = {
  verdict: "verified",
  value: 166,
  unit: null,
  claim: "The longest title in the file runs this many minutes.",
  code: { language: "python", source: "print(2)", explanation: "Took the largest duration.", lineCount: 4 },
  execution: { exitCode: 0, stdout: "166", stderr: "", value: 166, contextValues: {}, durationMs: 765 },
  grounding: {
    columns: ["duration_amount"],
    rowCount: 40,
    rowRange: [0, 39],
    sampleCells: [{ row: 3, column: "duration_amount", value: "166" }],
    schemaEvidence: [],
  },
  context: [],
  valence: "good",
  attempts: 1,
};

const FINDING_C: VerifiedFinding = {
  ...FINDING_B,
  value: 88,
  claim: "The shortest title in the file runs this many minutes.",
  grounding: { ...FINDING_B.grounding },
};

const UNVERIFIED: Finding = {
  verdict: "unverified",
  reason: "not_grounded",
  detail: "The result could not be traced back to real cells.",
  code: null,
  attempts: 2,
};

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

/** Render a slide exactly the way DeckPlayer does: against ITS finding. */
function renderSlide(deck: Deck, slide: Deck["slides"][number]): string {
  const finding = deck.findings?.[slide.findingIndex ?? 0] ?? FINDING_A;
  return renderToStaticMarkup(
    createElement(DeckSlide, {
      slide,
      finding,
      findings: deck.findings,
      dataset,
      benchmark,
      activeFocus: slide.beats[0]?.focus ?? null,
    }),
  );
}

describe("multi-finding deck — the single finding is untouched", () => {
  it("a one-element list builds a byte-identical deck to a bare finding", () => {
    const asList = buildDeck("What were total sales?", [FINDING_A], profile);
    const asSingle = buildDeck("What were total sales?", FINDING_A, profile);
    expect(JSON.stringify(asList)).toBe(JSON.stringify(asSingle));
    expect(asList.findings).toBeUndefined();
  });

  it("one survivor out of several attempts still builds the single-finding deck", () => {
    const withFailure = buildDeck("q", [FINDING_A, UNVERIFIED], profile);
    const single = buildDeck("q", FINDING_A, profile);
    expect(JSON.stringify(withFailure)).toBe(JSON.stringify(single));
  });

  it("no verified findings, no deck — nothing to present, nothing to speak", () => {
    expect(buildDeck("q", [UNVERIFIED, UNVERIFIED], profile).slides).toEqual([]);
    expect(buildDeck("q", [], profile).slides).toEqual([]);
  });
});

describe("multi-finding deck — several findings, one narrative", () => {
  const deck = buildDeck("What is worth knowing?", [FINDING_A, FINDING_B], profile);

  it("frames the set, presents each finding in order, and ties them together", () => {
    expect(deck.slides.map((slide) => slide.kind)).toEqual([
      "opener",
      "finding",
      "meaning",
      "caveat",
      "working",
      "finding",
      "working",
      "summary",
    ]);
    expect(deck.slides[0]?.spoken).toContain("two things are worth your attention");
    expect(new Set(deck.slides.map((slide) => slide.id)).size).toBe(deck.slides.length);
  });

  it("every slide knows which finding it presents", () => {
    const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
    expect(byId.get("finding-0")?.findingIndex).toBe(0);
    expect(byId.get("working-0")?.findingIndex).toBe(0);
    expect(byId.get("caveat-0-0")?.findingIndex).toBe(0);
    expect(byId.get("finding-1")?.findingIndex).toBe(1);
    expect(byId.get("working-1")?.findingIndex).toBe(1);
    expect(deck.findings?.map((finding) => finding.value)).toEqual([143787.36, 166]);
  });

  it("each figure is presented by its own finding and none is inferred from another", () => {
    const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
    expect(byId.get("finding-0")?.title).toBe("143,787.36");
    expect(byId.get("finding-0")?.spoken).toContain("The first answer is 143,787.36");
    expect(byId.get("finding-0")?.spoken).not.toContain("166");
    expect(byId.get("finding-1")?.title).toBe("166");
    expect(byId.get("finding-1")?.spoken).toContain("The second answer is 166");
    expect(byId.get("finding-1")?.spoken).not.toContain("143,787.36");

    // The summary REPEATS both executed figures — it never computes a new one.
    const summary = deck.slides.at(-1);
    expect(summary?.spoken).toContain("143,787.36");
    expect(summary?.spoken).toContain("166");
    const everyFigure = /[\d,]+(?:\.\d+)?/g;
    const spokenFigures = new Set(
      deck.slides.flatMap((slide) => slide.spoken.match(everyFigure) ?? []),
    );
    const groundedFigures = new Set(
      [FINDING_A, FINDING_B].flatMap((finding) => [
        String(finding.value.toLocaleString("en-US", { maximumFractionDigits: 2 })),
        ...finding.context.map((figure) =>
          String(
            typeof figure.value === "number"
              ? figure.value.toLocaleString("en-US", { maximumFractionDigits: 2 })
              : figure.value,
          ),
        ),
      ]),
    );
    // Years and counts inside the reconciled CLAIM text are the model's
    // sentence, gated upstream by lib/claim.ts — only standalone figures
    // belong to the deck. A figure that appears nowhere — not executed, not
    // claimed — has no business being spoken.
    const claimText = [FINDING_A, FINDING_B].map((finding) => finding.claim).join(" ");
    for (const figure of spokenFigures) {
      if (figure.length <= 2) continue; // row counts and ordinals are not claims
      if (claimText.includes(figure)) continue;
      expect(groundedFigures.has(figure), `ungrounded figure spoken: ${figure}`).toBe(true);
    }
  });

  it("a failed finding in the middle is simply absent — nothing hedges", () => {
    const withGap = buildDeck("What is worth knowing?", [FINDING_A, UNVERIFIED, FINDING_B], profile);
    expect(JSON.stringify(withGap)).toBe(JSON.stringify(deck));
    const deckText = JSON.stringify(withGap.slides).toLowerCase();
    expect(deckText).not.toContain("pending");
    expect(deckText).not.toContain("unverified");
    expect(deckText).not.toContain("could not");
    expect(deckText).not.toContain("skipped");
  });

  it("routes follow-ups inside a multi-finding deck the same way", () => {
    expect(matchSlide("show me the code", deck)?.kind).toBe("working");
    expect(matchSlide("recap", deck)?.kind).toBe("summary");
    expect(matchSlide("which region had the highest profit margin", deck)).toBeNull();
  });

  /*
   * Every per-finding slide claims the same topics — each working slide claims
   * "code" — so a deictic follow-up scores identically against all of them.
   * Keeping the first match sent "show me the code", asked while the SECOND
   * finding was on screen, back to the FIRST finding's program: on stage Vera
   * answers a question about one number by showing the working for another.
   */
  it("answers a deictic follow-up with the slide for the finding on screen", () => {
    const first = deck.slides.findIndex((slide) => slide.id === "finding-0");
    const second = deck.slides.findIndex((slide) => slide.id === "finding-1");
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);

    expect(matchSlide("show me the code", deck, second)?.id).toBe("working-1");
    expect(matchSlide("show me the code", deck, first)?.id).toBe("working-0");
    // The deck-wide slides are unaffected: there is only one summary to reach.
    expect(matchSlide("recap", deck, second)?.id).toBe("summary");
  });

  it("keeps every narrated line free of code jargon", () => {
    const voiceJargon =
      /\b(column|pandas|python|dd\/mm|mm\/dd|day.first|month.first|format|parse[sd]?|row count|dtype|csv)\b/i;
    for (const slide of deck.slides) {
      if (slide.kind === "working") continue;
      expect(slide.spoken, `${slide.id} spoke jargon`).not.toMatch(voiceJargon);
      for (const beat of slide.beats) {
        expect(beat.spoken, `${slide.id} beat`).not.toMatch(voiceJargon);
      }
    }
  });
});

describe("multi-finding deck — rendered, not just spoken", () => {
  const deck = buildDeck("What is worth knowing?", [FINDING_A, FINDING_B, FINDING_C], profile);

  it("renders no code jargon on any presentation slide", () => {
    for (const slide of deck.slides) {
      if (slide.kind === "working") continue;
      const text = renderedText(renderSlide(deck, slide));
      expect(text, `${slide.id} rendered jargon`).not.toMatch(JARGON);
    }
  });

  it("renders every verified figure on the summary, each with its own rows read", () => {
    const summary = deck.slides.at(-1);
    expect(summary?.kind).toBe("summary");
    const text = renderedText(renderSlide(deck, summary!));
    expect(text).toContain("143,787.36");
    expect(text).toContain("166");
    expect(text).toContain("88");
    expect(text).toContain("9,994 rows read");
    expect(text).toContain("40 rows read");
    // The honest split is untouched: the benchmark stays a separate,
    // pre-computed aggregate beneath the live figures.
    expect(text).toContain("Pre-computed aggregate benchmark");
  });

  it("renders every beat focus as a focusable presentation region", () => {
    for (const slide of deck.slides) {
      const markup = renderSlide(deck, slide);
      for (const beat of slide.beats) {
        expect(markup, `${slide.id} missing focus ${beat.focus}`).toContain(
          `data-focus="${beat.focus}"`,
        );
      }
    }
  });

  it("each working slide shows its own finding's code and cells", () => {
    const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
    const firstWorking = renderSlide(deck, byId.get("working-0")!);
    const secondWorking = renderSlide(deck, byId.get("working-1")!);
    expect(firstWorking).toContain("print(1)");
    expect(firstWorking).toContain("9,994 rows read");
    expect(secondWorking).toContain("print(2)");
    expect(secondWorking).toContain("40 rows read");
    // Working slides are where technical detail belongs — column names allowed.
    expect(secondWorking).toContain("duration_amount");
  });
});
