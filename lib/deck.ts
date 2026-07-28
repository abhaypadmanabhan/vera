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
  /**
   * Which verified finding this slide presents, as an index into
   * `Deck.findings`. Absent on a single-finding deck, where there is only one
   * finding to present — the player treats absent as 0.
   */
  findingIndex?: number;
}

/** A finding the gate passed: the only kind a deck is allowed to present. */
export type VerifiedFinding = Extract<Finding, { verdict: "verified" }>;

export interface Deck {
  question: string;
  slides: Slide[];
  /**
   * The verified findings behind the slides, in the order they are presented.
   * Only set when the deck carries MORE than one — a single-finding deck is
   * exactly the shape it has always been, and the caller already holds the
   * finding.
   */
  findings?: VerifiedFinding[];
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

/**
 * A description the program already wrote as a comparison — "higher than the
 * same quarter a year earlier", "down on the month before" — so the figure slots
 * straight in front of it and Vera says the change rather than reciting a second
 * number for the listener to subtract.
 *
 * The change itself is never computed here. It is a context figure the generated
 * program produced and grounding kept, exactly like every other figure Vera
 * speaks. A delta TypeScript derived from two verified numbers would still be a
 * figure no code produced (PRD §6).
 */
const CHANGE_PHRASE =
  /^(up|down|higher|lower|ahead|behind|above|below|more|less|better|worse|faster|slower|an? (increase|decrease|rise|fall|drop|gain|improvement))\b/i;

function meaningLine(figure: ContextFigure): string {
  const value = fmt(figure.value, null);
  return CHANGE_PHRASE.test(figure.description.trim())
    ? `That is ${value} ${figure.description}.`
    : `Set against ${figure.description}, that is ${value}.`;
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
    ? "One thing changes the answer — and nothing in the file disagreed"
    : "One thing changes the answer — what the rows said";
}

/**
 * What the check actually proved, in one sentence.
 *
 * `SchemaEvidence` counts the rows that SUPPORT the claim and the rows that
 * CONTRADICT it, and permits rows that do neither — a value that reads validly
 * both ways is ambiguous, not agreement. The demo evidence is 5,952 supporting
 * and 0 contradicting on a 9,994-row file, so "every row agrees" was a false
 * statement of proof on a slide Vera narrates (PRD §6). Zero contradictions
 * proves that nothing disagreed, and that is the most this line may say.
 *
 * The ambiguous count is deliberately not computed: `grounding.rowCount` is how
 * many rows the ANSWER touched, not how many the schema check read, and
 * subtracting one from the other would invent a figure no code produced.
 */
function agreementLine(evidence: SchemaEvidence): string {
  return evidence.contradictingRows === 0
    ? "I checked it against every row before I used it, and not one of them disagreed."
    : "I checked it against every row before I used it.";
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
  return (
    "There is something in this file worth knowing about. " +
    "Taken at face value it would have sent the answer badly wrong, and nothing would have warned you. " +
    agreementLine(evidence)
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
 * Turn verified findings into a deck.
 *
 * Accepts one finding (the shape it has always had) or an ordered list. The
 * rules are the honesty rules, expressed structurally:
 *
 * - A finding that did not verify gets NO slides. It is absent from the deck —
 *   never presented, never hedged, never "pending".
 * - One verified finding produces exactly the deck it always has, byte for
 *   byte — the cheapest proof that nothing broke.
 * - Several verified findings compose into one narrative: an opener that
 *   frames the set, each finding fully grounded on its own (figure, meaning,
 *   caveat, working), and a summary that ties them together. No figure is ever
 *   inferred from another finding — each one came out of its own executed run.
 */
export function buildDeck(
  question: string,
  finding: Finding | readonly Finding[],
  profile: DatasetProfile,
): Deck {
  const list: readonly Finding[] = Array.isArray(finding) ? finding : [finding];
  const verified = list.filter(
    (candidate): candidate is VerifiedFinding => candidate.verdict === "verified",
  );
  if (verified.length === 0) return { ...NO_DECK, question };
  const [only] = verified;
  if (verified.length === 1 && only) return buildSingleDeck(question, only, profile);
  return buildMultiDeck(question, verified, profile);
}

/**
 * The single-finding deck. This is the deck Vera has always presented; the
 * body below is unchanged, and `buildDeck` routes here whenever exactly one
 * finding verified — even if others failed alongside it.
 */
function buildSingleDeck(
  question: string,
  finding: VerifiedFinding,
  profile: DatasetProfile,
): Deck {
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
      // The slide shows "19%"; the voice says "19 percent".
      spoken: meaningLines.map(speakable).join(" "),
      beats: finding.context.map((contextFigure, index) => ({
        focus: meaningFocus[index] ?? "tertiary",
        spoken: speakable(meaningLine(contextFigure)),
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
            agreementLine(evidence),
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

/** A count Vera can say out loud: "three things", never "3 things". */
const COUNT_WORDS = [
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

function countWord(count: number): string {
  return COUNT_WORDS[count - 2] ?? String(count);
}

/**
 * Where this finding sits in the set, as the lead of the sentence Vera says.
 * The set has a shape — a first, a middle, a last — and saying so is what
 * makes several findings one narrative rather than a queue of answers.
 */
function findingLead(index: number, total: number): string {
  if (index === 0) return "The first answer is";
  if (index === total - 1) return total === 2 ? "The second answer is" : "And the last answer is";
  return "The next answer is";
}

/**
 * Several independently verified findings, composed into one deck with a
 * through-line. Every finding gets the same treatment the single finding
 * always got — its own figure slide, its own meaning and caveat slides, its
 * own working slide — because each one was its own executed run, grounded in
 * its own cells. Nothing here derives one finding from another.
 *
 * Slide ids carry the finding index (`finding-1`, `caveat-1-0`, `working-1`)
 * so they stay unique across the set, and every slide records `findingIndex`
 * so the player renders it against the finding it belongs to.
 */
function buildMultiDeck(
  question: string,
  findings: readonly VerifiedFinding[],
  profile: DatasetProfile,
): Deck {
  const total = findings.length;
  const slides: Slide[] = [];

  const openerSpoken =
    `I have been through the file, and ${countWord(total)} things are worth your attention. ` +
    "Each one was computed from the data itself, and I will show you the working for every one of them.";
  slides.push({
    id: "opener",
    kind: "opener",
    title: question,
    subtitle: `${displayName(profile.filename)} · ${profile.rowCount.toLocaleString()} rows`,
    spoken: openerSpoken,
    beats: [{ focus: "question", spoken: openerSpoken }],
    covers: ["question", "ask", "what did i ask", "findings", "set"],
  });

  findings.forEach((finding, index) => {
    const figure = fmt(finding.value, finding.unit);
    const lead = findingLead(index, total);
    const proven: SchemaEvidence[] = finding.grounding.schemaEvidence.filter(isProven);

    slides.push({
      id: `finding-${index}`,
      kind: "finding",
      title: figure,
      subtitle: finding.claim,
      spoken: `${lead} ${figure}. ${speakable(finding.claim)}`,
      beats: [
        { focus: "figure", spoken: `${lead} ${figure}.` },
        { focus: "claim", spoken: speakable(finding.claim) },
      ],
      covers: ["answer", "number", "result", "how much", "total", "figure"],
      findingIndex: index,
    });

    if (finding.context.length > 0) {
      const meaningLines = finding.context.map(meaningLine);
      const meaningFocus = ["primary", "secondary", "tertiary"] as const;
      slides.push({
        id: `meaning-${index}`,
        kind: "meaning",
        title: "What that means",
        subtitle: meaningLines.join(" "),
        spoken: meaningLines.map(speakable).join(" "),
        beats: finding.context.map((contextFigure, contextIndex) => ({
          focus: meaningFocus[contextIndex] ?? "tertiary",
          spoken: speakable(meaningLine(contextFigure)),
        })),
        covers: [
          "meaning",
          "comparison",
          "compare",
          "context",
          "prior",
          ...finding.context.map((contextFigure) => contextFigure.description.toLowerCase()),
        ],
        findingIndex: index,
      });
    }

    for (const [evidenceIndex, evidence] of proven.entries()) {
      const spoken = caveatLine(evidence);
      slides.push({
        id: `caveat-${index}-${evidenceIndex}`,
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
              agreementLine(evidence),
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
        findingIndex: index,
      });
    }

    slides.push({
      id: `working-${index}`,
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
      findingIndex: index,
    });
  });

  // The summary ties the set together out loud by REPEATING figures that were
  // each already executed and grounded — it computes nothing new, and it never
  // mentions a finding that did not verify, because there are none in the list.
  const summaryBeats: Beat[] = findings.map((finding, index) => ({
    focus: `figure-${index}`,
    spoken:
      (index === 0 ? "So, to bring it together. " : "") +
      `${fmt(finding.value, finding.unit)}. ${speakable(finding.claim)}`,
  }));
  summaryBeats.push({
    focus: "proof",
    spoken:
      "Every one of them was computed and traced back to the cells it came from. " +
      "Ask me anything else and I will show my working again.",
  });
  slides.push({
    id: "summary",
    kind: "summary",
    title: "What it adds up to",
    subtitle: null,
    spoken: summaryBeats.map((beat) => beat.spoken).join(" "),
    beats: summaryBeats,
    covers: ["summary", "recap", "overall", "dashboard", "again"],
    findingIndex: 0,
  });

  return { question, slides, findings: [...findings] };
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
 *
 * `fromIndex` is the slide the viewer is looking at, and it breaks ties. Every
 * per-finding slide in a multi-finding deck carries the SAME topics — each
 * working slide claims "code" — so scores tie constantly, and keeping the first
 * one sent "show me the code" asked while viewing the second finding back to
 * the FIRST finding's code. A deictic follow-up points at what is on screen, so
 * a tie resolves to the slide presenting the same finding, then to the nearest.
 */
export function matchSlide(question: string, deck: Deck, fromIndex = 0): Slide | null {
  const asked = question.toLowerCase();
  const words = new Set(asked.split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const deictic = contentWords(words).size <= DEICTIC_WORD_LIMIT;
  // A slide with no `findingIndex` belongs to the only finding there is.
  const fromFinding = deck.slides[fromIndex]?.findingIndex ?? 0;

  type Candidate = { slide: Slide; score: number; sameFinding: boolean; distance: number };
  const outranks = (candidate: Candidate, incumbent: Candidate): boolean => {
    if (candidate.score !== incumbent.score) return candidate.score > incumbent.score;
    if (candidate.sameFinding !== incumbent.sameFinding) return candidate.sameFinding;
    return candidate.distance < incumbent.distance;
  };

  let best: Candidate | null = null;
  for (const [index, slide] of deck.slides.entries()) {
    let score = 0;
    for (const topic of slide.covers) {
      if (topic.includes(" ")) {
        if (asked.includes(topic)) score += 3;
      } else if (words.has(topic)) {
        score += 2;
      }
    }
    if (score === 0) continue;
    const candidate: Candidate = {
      slide,
      score,
      sameFinding: (slide.findingIndex ?? 0) === fromFinding,
      distance: Math.abs(index - fromIndex),
    };
    if (!best || outranks(candidate, best)) best = candidate;
  }

  if (!best) return null;
  return best.score >= (deictic ? 2 : 3) ? best.slide : null;
}
