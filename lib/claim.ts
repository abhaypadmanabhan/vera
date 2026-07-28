/*
 * Reconciling what Vera SAYS with what the code actually COMPUTED.
 *
 * The model writes the analysis code and the plain-English headline in the same
 * response — that is, it writes the sentence *before* the code has run. Left
 * alone it will happily author a figure into that sentence, and the figure is a
 * guess. This was observed live: the sandbox returned 143787.36 while the
 * headline read "281,420 dollars". The screen and the voice both take the
 * headline, so Vera would have said a number that no code produced.
 *
 * That is the exact failure PRD §6 exists to prevent, so the model is no longer
 * trusted to place the figure. It emits the sentence with a `{value}` slot and
 * this module substitutes the executed value.
 *
 * The substitution is the happy path. Everything below it is the net for when
 * the model ignores the instruction — and the net always fails toward a claim
 * built from the executed value, never toward the model's sentence.
 */

/** The slot the codegen prompt requires in every headline. */
export const VALUE_SLOT = "{value}";

/**
 * Digit runs, with optional thousands separators and decimals. Deliberately
 * ignores any leading currency symbol or trailing unit — we compare magnitudes,
 * not formatting.
 *
 * The sign is part of the literal, because a loss is a real answer here: the
 * Tables sub-category loses money, and without this a correct headline reading
 * "lost -3,000.50" had its minus stripped, failed to match the executed
 * -3000.50, and was discarded and rebuilt. Fail-safe, but it threw away good
 * wording on every negative figure.
 *
 * The lookbehind keeps a hyphen between two numbers out of it: in "2018-2019"
 * the match starts at `2`, not at `-`, so a year range stays two positive
 * years rather than becoming 2018 and -2019.
 */
const NUMERIC_LITERAL = /(?<![\d.])-?\d[\d,]*(?:\.\d+)?/g;

/** Matches the display formatting used on screen and by the voice: 2dp, grouped. */
export function formatValue(value: number | string): string {
  if (typeof value === "string") return value;
  return Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

function parseLiteral(literal: string): number {
  return Number(literal.replace(/,/g, ""));
}

/**
 * Does this literal plausibly refer to the computed value?
 *
 * Compared after rounding to 2dp, because the sentence quotes the number the way
 * it is displayed while `value` carries full precision. A bare integer year like
 * 2018 will not match a real figure, which is what we want: contextual numbers
 * must be recognised as *not* the answer.
 */
function matchesValue(literal: string, value: number | string): boolean {
  if (typeof value === "string") return literal === value;
  const parsed = parseLiteral(literal);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(parsed - value) < 0.005 || Math.abs(parsed - Math.round(value)) < 0.5;
}

/**
 * Numbers a headline may legitimately carry without being the answer: anything
 * the user themselves wrote. "Sales in the third quarter of 2018" gets to keep
 * its 2018 because the question said 2018.
 */
function contextualNumbers(question: string): Set<number> {
  const found = question.match(NUMERIC_LITERAL) ?? [];
  return new Set(found.map(parseLiteral).filter(Number.isFinite));
}

export interface ReconcileInput {
  /** The model's sentence, ideally containing `{value}`. */
  headline: string;
  /** The question the user asked, used to recognise contextual numbers. */
  question: string;
  /** The value the sandbox actually returned. */
  value: number | string;
  /** Fallback sentence when the headline cannot be trusted at all. */
  fallback: string;
}

export interface ReconcileResult {
  claim: string;
  /**
   * How the claim was produced. `substituted` is the healthy path; the others
   * mean the model misbehaved and are worth surfacing in telemetry.
   */
  source: "substituted" | "verified-literal" | "rebuilt";
}

/**
 * Returns a claim whose every figure is the executed one.
 *
 * Never returns a sentence containing a number the code did not produce. When
 * in doubt it discards the model's wording entirely — a plainer true sentence
 * beats a well-phrased false one.
 */
export function reconcileClaim({
  headline,
  question,
  value,
  fallback,
}: ReconcileInput): ReconcileResult {
  const formatted = formatValue(value);
  const trimmed = headline.trim();

  // Happy path: the model left the slot, so we place the real figure.
  if (trimmed.includes(VALUE_SLOT)) {
    return { claim: trimmed.split(VALUE_SLOT).join(formatted), source: "substituted" };
  }

  const rebuild = (): ReconcileResult => ({
    claim: fallback.trim() || `The answer is ${formatted}.`,
    source: "rebuilt",
  });

  if (trimmed === "") return rebuild();

  const literals = trimmed.match(NUMERIC_LITERAL) ?? [];
  if (literals.length === 0) {
    // No figures at all — the sentence cannot misstate one. Safe as written.
    return { claim: trimmed, source: "verified-literal" };
  }

  // Every figure must be either the computed value or a number the user wrote.
  const context = contextualNumbers(question);
  const allAccountedFor = literals.every((literal) => {
    if (matchesValue(literal, value)) return true;
    const parsed = parseLiteral(literal);
    return Number.isFinite(parsed) && context.has(parsed);
  });

  return allAccountedFor ? { claim: trimmed, source: "verified-literal" } : rebuild();
}
