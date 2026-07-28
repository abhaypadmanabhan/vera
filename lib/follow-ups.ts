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
 */
import { classifyQuestion } from "./guardrails/classify";
import type { ColumnProfile, DatasetProfile, Finding } from "./types";

/** Suggestions shown at once. Three is a menu; six is homework. */
const MAX_SUGGESTIONS = 3;

/** A category column worth slicing by: few enough distinct values to be readable. */
const MAX_GROUPING_CARDINALITY = 40;

function isGroupable(column: ColumnProfile): boolean {
  return (
    column.kind === "category" &&
    column.distinctCount > 1 &&
    column.distinctCount <= MAX_GROUPING_CARDINALITY
  );
}

function isMeasure(column: ColumnProfile): boolean {
  return column.kind === "number" || column.kind === "integer";
}

/** Column names read as prose, so no suggestion leaks a schema identifier. */
function spoken(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
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
    profile.columns.find((column) => used.has(column.name) && isMeasure(column)) ??
    profile.columns.find(isMeasure) ??
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

  const measure = subjectMeasure(finding, profile);
  if (!measure) return [];

  const measureName = spoken(measure.name);
  const used = new Set(finding.grounding.columns);
  const dateColumn = profile.columns.find(
    (column) => column.kind === "date" && column.dateFormat !== null,
  );

  // Slice the same measure by dimensions this answer did NOT already use — a
  // breakdown by something already in the answer just restates it.
  const groupings = profile.columns
    .filter((column) => isGroupable(column) && !used.has(column.name))
    .slice(0, 3);

  const candidates: string[] = [];
  for (const grouping of groupings) {
    candidates.push(`Which ${spoken(grouping.name)} had the highest ${measureName}?`);
  }
  if (dateColumn) {
    candidates.push(`How did ${measureName} change year over year?`);
  }
  if (groupings[0]) {
    candidates.push(
      `What share of ${measureName} came from the top ${spoken(groupings[0].name)}?`,
    );
  }

  // A suggestion is a promise. Anything the guardrail would refuse never ships.
  const answerable = candidates.filter(
    (question) => classifyQuestion(question, profile).allowed,
  );

  return [...new Set(answerable)].slice(0, MAX_SUGGESTIONS);
}
