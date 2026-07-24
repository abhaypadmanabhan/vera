import { isProven } from "./types";
import type { DatasetProfile, Finding, SchemaEvidence } from "./types";

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
  | "question"
  | "headline"
  | "trap"
  | "code"
  | "cells"
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

function fmt(value: number | string, unit: string | null): string {
  const base =
    typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : value;
  return unit ? `${base}${unit}` : base;
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
    id: "question",
    kind: "question",
    title: question,
    subtitle: `${profile.filename} · ${profile.rowCount.toLocaleString()} rows`,
    spoken: `You asked: ${speakable(question)}`,
    beats: [
      { focus: "question", spoken: `You asked: ${speakable(question)}` },
      { focus: "file", spoken: `I looked at ${profile.filename}, ${profile.rowCount.toLocaleString()} rows.` },
    ],
    covers: ["question", "ask", "what did i ask"],
  });

  slides.push({
    id: "headline",
    kind: "headline",
    title: figure,
    subtitle: finding.claim,
    spoken: `${figure}. ${speakable(finding.claim)}`,
    beats: [
      { focus: "figure", spoken: `${figure}.` },
      { focus: "claim", spoken: speakable(finding.claim) },
    ],
    covers: ["answer", "number", "result", "how much", "total", "figure"],
  });

  // The trap slide only exists when there is something real to show.
  for (const [index, evidence] of proven.entries()) {
    slides.push({
      id: `trap-${index}`,
      kind: "trap",
      title: evidence.claim,
      subtitle: `${evidence.supportingRows.toLocaleString()} rows prove it · ${evidence.contradictingRows.toLocaleString()} argue otherwise`,
      spoken: speakable(evidence.method),
      beats: [
        { focus: "claim", spoken: `${speakable(evidence.claim)}.` },
        { focus: "counts", spoken: `${evidence.supportingRows.toLocaleString()} rows prove it. ${evidence.contradictingRows.toLocaleString()} argue otherwise.` },
        { focus: "method", spoken: speakable(evidence.method) },
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
    id: "code",
    kind: "code",
    title: "The code that ran",
    subtitle: `${finding.code.lineCount} lines · exit ${finding.execution.exitCode} · ${finding.execution.durationMs} ms`,
    spoken: `Here is the code that produced it. ${speakable(finding.code.explanation)}`,
    beats: [
      { focus: "code", spoken: "Here is the code that produced it." },
      { focus: "explanation", spoken: speakable(finding.code.explanation) },
      { focus: "exit", spoken: `It exited cleanly in ${finding.execution.durationMs} milliseconds.` },
    ],
    covers: ["code", "pandas", "python", "script", "run", "what did you run"],
  });

  slides.push({
    id: "cells",
    kind: "cells",
    title: "The cells it read",
    subtitle: `${finding.grounding.columns.join(", ")} across ${finding.grounding.rowCount.toLocaleString()} rows`,
    spoken: `Every figure traces back to real cells — ${finding.grounding.columns.join(" and ")}, across ${finding.grounding.rowCount.toLocaleString()} rows.`,
    beats: [
      { focus: "columns", spoken: `It read ${finding.grounding.columns.join(" and ")}.` },
      { focus: "rows", spoken: `Across ${finding.grounding.rowCount.toLocaleString()} rows of your file.` },
    ],
    covers: ["cells", "source", "rows", "columns", "data", "where from", "trace"],
  });

  slides.push({
    id: "summary",
    kind: "summary",
    title: figure,
    subtitle: finding.claim,
    spoken: `To summarise. ${figure}. ${speakable(finding.claim)} Computed, and traceable.`,
    beats: [
      { focus: "figure", spoken: `To summarise. ${figure}.` },
      { focus: "claim", spoken: speakable(finding.claim) },
      { focus: "proof", spoken: "Computed, and traceable." },
    ],
    covers: ["summary", "recap", "overall", "dashboard", "again"],
  });

  return { question, slides };
}

/**
 * Route a follow-up question back to the slide that already covered it.
 *
 * Deliberately simple and deterministic — token overlap against each slide's
 * `covers` list. Returns null when nothing clearly matches, and the caller should
 * run a fresh analysis rather than pretend an old slide answers it.
 */
export function matchSlide(question: string, deck: Deck): Slide | null {
  const asked = question.toLowerCase();
  const words = new Set(asked.split(/[^a-z0-9]+/).filter((w) => w.length > 2));

  let best: { slide: Slide; score: number } | null = null;
  for (const slide of deck.slides) {
    let score = 0;
    for (const topic of slide.covers) {
      if (topic.includes(" ")) {
        if (asked.includes(topic)) score += 3;
      } else if (words.has(topic)) {
        // Single-word topics are curated and distinctive, so one hit is a real signal.
        score += 2;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { slide, score };
  }

  return best && best.score >= 2 ? best.slide : null;
}
