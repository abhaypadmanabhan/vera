import { isProven } from "./types";
import type {
  ContextFigure,
  DatasetProfile,
  Finding,
  SchemaEvidence,
  Valence,
} from "./types";

/**
 * Vera presents a finding as a KEYNOTE, not a page.
 *
 * A verified finding becomes an ordered deck of slides. The voice narrates each
 * one (`spoken`), the UI cross-fades between them, and the deck ends on a summary
 * dashboard. After narration the viewer can jump to any slide — and if their
 * follow-up question is something Vera already covered, `matchSlide` finds the
 * slide that covered it so she can go back and reference it.
 *
 * This module is pure and has no UI opinion, so the player can be rebuilt freely.
 */

export type SlideKind =
  | "opener"
  | "finding"
  | "meaning"
  | "caveat"
  | "working"
  | "summary";

/**
 * One narration beat: a line Vera says, and the region of the slide the presenter
 * blob moves to and highlights while she says it. `focus` matches a
 * `data-focus="..."` attribute rendered on that slide.
 */
export interface Beat {
  focus: string;
  spoken: string;
}

export interface Slide {
  id: string;
  kind: SlideKind;
  /** Short, big on screen. */
  title: string;
  /** One line under the title. Never a paragraph. */
  subtitle: string | null;
  /** What the voice says on this slide. Kept speakable — no code, no symbols. */
  spoken: string;
  /**
   * The narration broken into beats. The presenter blob walks these in order,
   * highlighting one region at a time — a presenter moving around their slide.
   * Concatenating `beats[].spoken` gives `spoken`.
   */
  beats: Beat[];
  /**
   * Topics this slide covers, lowercase. Used to route a follow-up question back
   * to the slide that already answered it.
   */
  covers: string[];
}

export interface Deck {
  question: string;
  slides: Slide[];
}

const NO_DECK: Deck = { question: "", slides: [] };

/**
 * Three moods, three different sentences. A shared stem with three tails reads
 * as a template because it is one, so each valence starts somewhere different:
 * an offer, a warning, a report.
 */
const OPENERS: Record<Valence, string> = {
  good: "There is good news in here, and I will start with it.",
  bad: "You are not going to like this one, so I will get straight to it.",
  neutral: "I have been through the file, and here is what came back.",
};

function fmt(value: number | string, unit: string | null): string {
  const base =
    typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : value;
  return unit ? `${base}${unit}` : base;
}

function meaningLine(figure: ContextFigure): string {
  return `Set against ${figure.description}, that is ${fmt(figure.value, null)}.`;
}

/**
 * Consequence, never method. The evidence supplies HOW MUCH agreed, which is the
 * only part of it a person cares about out loud — never the format, the column,
 * or the count. Works for any evidence a schema-driven profiler can produce, so
 * it must not assume the fact is about dates.
 */
/**
 * The proof chart's title, under the same rule as `caveatLine`: what the check
 * was about, never how it was expressed. `evidence.claim` is true and stays
 * inspectable on the working slide — but it carries a column name and a date
 * format, and neither belongs on a slide Vera narrates.
 */
export function evidenceHeadline(evidence: SchemaEvidence | null): string {
  if (!evidence) return "Rows behind the answer";
  return evidence.contradictingRows === 0
    ? "One thing changes the answer — every row agrees"
    : "One thing changes the answer — what the rows said";
}

/**
 * The opener names the file the way a person says it, without the extension.
 * The working slide still shows the filename in full, which is where a technical
 * detail belongs.
 */
function displayName(filename: string): string {
  return filename.replace(/\.[a-z0-9]+$/i, "").trim() || filename;
}

function caveatLine(evidence: SchemaEvidence): string {
  const unanimous = evidence.contradictingRows === 0;
  return (
    "There is something in this file worth knowing about. " +
    "Taken at face value it would have sent the answer badly wrong, and nothing would have warned you. " +
    (unanimous
      ? "I checked it against every row before I used it, and they all agree."
      : "I checked it against every row before I used it.")
  );
}

/** Strip a claim down to something a voice can say naturally. */
function speakable(text: string): string {
  return text
    .replace(/`[^`]*`/g, "")
    .replace(/["'%$]/g, (m) => (m === "%" ? " percent" : m === "$" ? "" : ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn a verified finding into a deck.
 *
 * An unverified finding gets NO deck — there is nothing to present and nothing to
 * speak. The caller renders the refusal state instead. This is the honesty rule
 * expressed structurally: no number, no narration, no slides.
 */
export function buildDeck(
  question: string,
  finding: Finding,
  profile: DatasetProfile,
): Deck {
  if (finding.verdict !== "verified") return { ...NO_DECK, question };

  const figure = fmt(finding.value, finding.unit);
  const proven: SchemaEvidence[] = finding.grounding.schemaEvidence.filter(isProven);
  const slides: Slide[] = [];

  slides.push({
    id: "opener",
    kind: "opener",
    title: question,
    subtitle: `${displayName(profile.filename)} · ${profile.rowCount.toLocaleString()} rows`,
    spoken: OPENERS[finding.valence],
    beats: [
      { focus: "question", spoken: OPENERS[finding.valence] },
    ],
    covers: ["question", "ask", "what did i ask"],
  });

  slides.push({
    id: "finding",
    kind: "finding",
    title: figure,
    subtitle: finding.claim,
    spoken: `The answer is ${figure}. ${speakable(finding.claim)}`,
    beats: [
      { focus: "figure", spoken: `The answer is ${figure}.` },
      { focus: "claim", spoken: speakable(finding.claim) },
    ],
    covers: ["answer", "number", "result", "how much", "total", "figure"],
  });

  if (finding.context.length > 0) {
    const meaningLines = finding.context.map(meaningLine);
    const meaningFocus = ["primary", "secondary", "tertiary"] as const;
    slides.push({
      id: "meaning",
      kind: "meaning",
      title: "What that means",
      subtitle: meaningLines.join(" "),
      spoken: meaningLines.join(" "),
      beats: finding.context.map((contextFigure, index) => ({
        focus: meaningFocus[index] ?? "tertiary",
        spoken: meaningLine(contextFigure),
      })),
      covers: [
        "meaning",
        "comparison",
        "compare",
        "context",
        "prior",
        ...finding.context.map((contextFigure) => contextFigure.description.toLowerCase()),
      ],
    });
  }

  for (const [index, evidence] of proven.entries()) {
    const spoken = caveatLine(evidence);
    slides.push({
      id: `caveat-${index}`,
      kind: "caveat",
      title: "One thing changes the answer",
      subtitle: `${evidence.supportingRows.toLocaleString()} rows prove it · ${evidence.contradictingRows.toLocaleString()} argue otherwise`,
      spoken,
      beats: [
        {
          focus: "claim",
          spoken: "There is something in this file worth knowing about.",
        },
        {
          focus: "consequence",
          spoken:
            "Taken at face value it would have sent the answer badly wrong, and nothing would have warned you. " +
            (evidence.contradictingRows === 0
              ? "I checked it against every row before I used it, and they all agree."
              : "I checked it against every row before I used it."),
        },
      ],
      covers: [
        "trap",
        "date",
        "format",
        "proof",
        "evidence",
        "how do you know",
        "why",
        evidence.claim.toLowerCase(),
      ],
    });
  }

  slides.push({
    id: "working",
    kind: "working",
    title: "The working",
    subtitle: `${finding.code.lineCount} lines · ${finding.grounding.rowCount.toLocaleString()} rows traced`,
    spoken: "",
    beats: [],
    covers: [
      "code",
      "pandas",
      "python",
      "script",
      "run",
      "what did you run",
      "cells",
      "source",
      "rows",
      "columns",
      "data",
      "where from",
      "trace",
    ],
  });

  slides.push({
    id: "summary",
    kind: "summary",
    title: figure,
    subtitle: finding.claim,
    spoken: `So: ${figure}. ${speakable(finding.claim)}`,
    beats: [
      { focus: "figure", spoken: `So, ${figure}.` },
      { focus: "claim", spoken: speakable(finding.claim) },
      { focus: "proof", spoken: "Ask me anything else and I will show my working again." },
    ],
    covers: ["summary", "recap", "overall", "dashboard", "again"],
  });

  return { question, slides };
}

/**
 * Words that carry no subject. Stripped before measuring how much the question
 * is actually asking about, so "which cells did you read" counts as two words,
 * not five.
 */
const FILLER = new Set([
  "the", "and", "for", "you", "did", "does", "was", "were", "are", "can",
  "could", "would", "should", "what", "which", "that", "this", "there", "here",
  "how", "show", "tell", "give", "please", "just", "again", "your", "with",
  "from", "into", "about", "more", "much", "many", "any", "some", "have", "has",
  "had", "get", "got", "put", "let", "see", "look", "back", "over", "then",
]);

function contentWords(words: Set<string>): Set<string> {
  return new Set([...words].filter((word) => !FILLER.has(word)));
}

/**
 * A follow-up carrying at most this much subject is deictic — it is pointing at
 * what is already on screen ("show me the code", "which cells?"). Above it, the
 * question brings its own subject, and one stray keyword is not enough to prove
 * an existing slide already answered it.
 */
const DEICTIC_WORD_LIMIT = 2;

/**
 * Route a follow-up question back to the slide that already covered it.
 *
 * Deliberately simple and deterministic — token overlap against each slide's
 * `covers` list. Returns null when nothing clearly matches, and the caller should
 * run a fresh analysis rather than pretend an old slide answers it.
 *
 * The length guard exists because single-word topics are common English. The
 * headline slide claims "total" and the code slide claims "run", so without it
 * "what were total sales by region?" scored a match and jumped back to a slide
 * that never answered it — on stage that reads as Vera ignoring the question.
 * A long question needs a phrase hit or two separate topics; a three-word one
 * still routes on a single keyword, which is the whole point of asking it.
 */
export function matchSlide(question: string, deck: Deck): Slide | null {
  const asked = question.toLowerCase();
  const words = new Set(asked.split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const deictic = contentWords(words).size <= DEICTIC_WORD_LIMIT;

  let best: { slide: Slide; score: number } | null = null;
  for (const slide of deck.slides) {
    let score = 0;
    for (const topic of slide.covers) {
      if (topic.includes(" ")) {
        if (asked.includes(topic)) score += 3;
      } else if (words.has(topic)) {
        score += 2;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { slide, score };
  }

  if (!best) return null;
  return best.score >= (deictic ? 2 : 3) ? best.slide : null;
}
