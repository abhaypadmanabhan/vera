/*
 * "You might also ask…" — the next questions, proposed from what Vera just did.
 *
 * Deliberately NOT a model call. These are suggestions, not answers, and a
 * suggestion that costs money and latency on every finding is a bad trade. Each
 * one is built from two things we already hold: the columns the executed code
 * actually read, and the profiled schema of the file.
 *
 * The rule that shapes everything here: **only propose questions Vera can
 * actually answer.** A suggestion is a promise. Offering "why did sales drop"
 * and then refusing it is worse than offering nothing, so every candidate is
 * phrased as a computation over rows — a breakdown, a comparison, a share, a
 * trend — and is checked against the guardrail before it is shown.
 *
 * A second rule, just as strict: **only aggregate a number that is honest to
 * aggregate.** A year, an identifier, a rating scale and a code are all
 * integers, and every one of them is a label that happens to be written with
 * digits. "What share of release year came from the top rating" is not a
 * question any analyst would ask. So a suggestion's measure must be a quantity
 * — and when the file holds no quantity at all, count-shaped questions are
 * proposed instead, because proposing nothing is better than proposing
 * nonsense.
 */
import { classifyQuestion } from "./guardrails/classify";
import type { ColumnProfile, DatasetProfile, Finding } from "./types";

/** Suggestions shown at once. Three is a menu; six is homework. */
const MAX_SUGGESTIONS = 3;

/** A category column worth slicing by: few enough distinct values to be readable. */
const MAX_GROUPING_CARDINALITY = 40;

/*
 * Words that make a numeric column a label: calendar parts, identifiers and
 * scales. Totalling any of these is meaningless no matter what the file is.
 * Matched against the spoken form of the name, so "release_year" and
 * "releaseYear" both read as "release year".
 */
const LABEL_NAME =
  /\b(?:year|yr|month|quarter|week|day|date|id|code|number|no|num|zip|postal|isbn|sku|ssn|phone|lat|lon|lng|rating|rank|grade|level|tier|score|scale|version)\b/;

/*
 * Words that make a numeric column a quantity: money, amounts, sizes,
 * durations and counts — things a total or an average can honestly describe.
 */
const QUANTITY_NAME =
  /\b(?:sales|revenue|turnover|profit|earnings|income|cost|costs|cogs|expense|expenses|amount|total|price|fees?|salary|budget|margin|discount|quantity|qty|units?|duration|minutes?|hours?|seconds?|days|weeks|weight|volume|length|width|height|depth|distance|area|size|count|spend|spent|payment|balance|population|attendance)\b/;

/** A calendar range narrow enough that every sample inside it reads as a year. */
const MIN_PLAUSIBLE_YEAR = 1500;
const MAX_PLAUSIBLE_YEAR = 2200;

/** A whole-number scale stays small: ratings and codes, never quantities. */
const MAX_SCALE_DISTINCT = 10;
const MAX_SCALE_VALUE = 100;

/** Nearly one value per row is an identifier that happens to be numeric. */
const IDENTIFIER_DISTINCT_RATIO = 0.95;

function isGroupable(column: ColumnProfile): boolean {
  return (
    column.kind === "category" &&
    column.distinctCount > 1 &&
    column.distinctCount <= MAX_GROUPING_CARDINALITY
  );
}

function integerSamples(column: ColumnProfile): number[] {
  return column.sampleValues
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
}

/** Every sample sits in a year-shaped range: the column is a moment, not an amount. */
function looksLikeYears(column: ColumnProfile): boolean {
  if (column.kind !== "integer") return false;
  const samples = integerSamples(column);
  return (
    samples.length > 0 &&
    samples.every(
      (value) => value >= MIN_PLAUSIBLE_YEAR && value <= MAX_PLAUSIBLE_YEAR,
    )
  );
}

/** Almost as many distinct values as rows: a key, not a quantity. */
function looksLikeIdentifier(column: ColumnProfile, rowCount: number): boolean {
  if (column.kind !== "integer" || rowCount === 0) return false;
  return column.distinctCount >= rowCount * IDENTIFIER_DISTINCT_RATIO;
}

/** A handful of small whole numbers: a rating scale or a code, not a quantity. */
function looksLikeScale(column: ColumnProfile): boolean {
  if (column.kind !== "integer" || column.distinctCount > MAX_SCALE_DISTINCT) {
    return false;
  }
  const samples = integerSamples(column);
  return (
    samples.length > 0 &&
    samples.every((value) => value >= 0 && value <= MAX_SCALE_VALUE)
  );
}

/*
 * Is this number a quantity, or a label that happens to be written with
 * digits? The name speaks first. When the name is silent, the shape of the
 * values decides — and only a proven label shape disqualifies, so an
 * unremarkable number on an unanticipated file still earns its breakdowns.
 */
function isMeasure(column: ColumnProfile, rowCount: number): boolean {
  if (column.kind !== "number" && column.kind !== "integer") return false;
  const name = spoken(column.name);
  if (LABEL_NAME.test(name)) return false;
  if (QUANTITY_NAME.test(name)) return true;
  return (
    !looksLikeYears(column) &&
    !looksLikeIdentifier(column, rowCount) &&
    !looksLikeScale(column)
  );
}

/** Column names read as prose, so no suggestion leaks a schema identifier. */
function spoken(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

/*
 * The noun for "how many X are there", taken from the file's own name when it
 * offers one ("netflix-titles.csv" counts titles). A bare table name like
 * "superstore.csv" offers nothing, and counting "superstore" would be
 * nonsense, so the fallback is the one noun that is always honest: rows.
 */
function rowNoun(filename: string): string {
  const tokens = filename
    .replace(/\.[^.]+$/, "")
    .split(/[^a-zA-Z]+/)
    .filter((token) => token.length >= 3);
  const last = tokens.length >= 2 ? tokens[tokens.length - 1] : undefined;
  return last ? last.toLowerCase() : "rows";
}

/**
 * The measure this finding was about, preferred over anything else in the file
 * — a follow-up should continue the thread, not change the subject.
 */
function subjectMeasure(
  finding: Finding,
  profile: DatasetProfile,
): ColumnProfile | null {
  if (finding.verdict !== "verified") return null;
  const used = new Set(finding.grounding.columns);
  return (
    profile.columns.find(
      (column) => used.has(column.name) && isMeasure(column, profile.rowCount),
    ) ??
    profile.columns.find((column) => isMeasure(column, profile.rowCount)) ??
    null
  );
}

/**
 * Proposes the next questions after a verified finding.
 *
 * Returns an empty list when the finding is unverified: there is no thread to
 * continue, and nudging someone onward from a refusal misreads the moment.
 */
export function suggestFollowUps(
  finding: Finding,
  profile: DatasetProfile,
): string[] {
  if (finding.verdict !== "verified") return [];

  const used = new Set(finding.grounding.columns);

  // Slice by dimensions this answer did NOT already use — a breakdown by
  // something already in the answer just restates it.
  const groupings = profile.columns
    .filter((column) => isGroupable(column) && !used.has(column.name))
    .slice(0, 3);

  const measure = subjectMeasure(finding, profile);
  const candidates: string[] = [];

  if (measure) {
    const measureName = spoken(measure.name);
    const dateColumn = profile.columns.find(
      (column) => column.kind === "date" && column.dateFormat !== null,
    );

    /*
     * Interleaved on purpose. Three breakdowns in a row read as one question
     * asked three ways; a breakdown, a trend and a share read as three
     * different things worth knowing.
     */
    if (groupings[0]) {
      candidates.push(`Which ${spoken(groupings[0].name)} had the highest ${measureName}?`);
    }
    if (dateColumn) {
      candidates.push(`How did ${measureName} change year over year?`);
    }
    if (groupings[1]) {
      candidates.push(
        `What share of ${measureName} came from the top ${spoken(groupings[1].name)}?`,
      );
    }
    // Only if the richer shapes were unavailable does a second plain breakdown
    // get a turn.
    for (const grouping of groupings.slice(1)) {
      candidates.push(`Which ${spoken(grouping.name)} had the highest ${measureName}?`);
    }
  } else {
    /*
     * No honest measure in the file, so nothing may be totalled, compared or
     * shared out. Counting is always honest: how many of the thing the file
     * records fall into each slice. The noun ships only if the guardrail
     * recognises it as something this file actually talks about.
     */
    let noun = rowNoun(profile.filename);
    if (
      noun !== "rows" &&
      !classifyQuestion(`How many ${noun} are there?`, profile).allowed
    ) {
      noun = "rows";
    }
    groupings.forEach((grouping, index) => {
      candidates.push(
        index % 2 === 0
          ? `How many ${noun} are there for each ${spoken(grouping.name)}?`
          : `Which ${spoken(grouping.name)} has the most ${noun}?`,
      );
    });
  }

  // A suggestion is a promise. Anything the guardrail would refuse never ships.
  const answerable = candidates.filter(
    (question) => classifyQuestion(question, profile).allowed,
  );

  return [...new Set(answerable)].slice(0, MAX_SUGGESTIONS);
}
