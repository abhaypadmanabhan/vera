import { parseCsv } from "./csv";
import { isProven } from "./types";
import type {
  BlockReason,
  DatasetProfile,
  ExecutionResult,
  Grounding,
  SchemaEvidence,
  SourceCell,
} from "./types";

/**
 * THE SAFEGUARD (PRD §4.4, §6).
 *
 * A finding is `verified` only if ALL of these hold:
 *   1. the code actually executed and exited 0,
 *   2. it returned a non-null, non-NaN value,
 *   3. that value is traceable to named columns of the real file.
 *
 * Anything else is blocked and routed to the retry loop, then to `unverified`.
 * This function is pure so it can be tested exhaustively without spending a cent.
 *
 * What this does NOT do, and must never be described as doing: decide whether a
 * cleanly-executing number is the *right answer* to the question. There is no
 * answer key at demo time (PRD §6). It checks provenance, not correctness.
 */

export type VerifyOutcome =
  | { ok: true; grounding: Grounding }
  | { ok: false; reason: BlockReason; detail: string };

export interface VerifyInput {
  execution: ExecutionResult;
  /** Columns the generated code declared it read. */
  columnsUsed: string[];
  profile: DatasetProfile;
  /** Raw file text, for quoting real cells back. */
  csvContent: string;
}

const MAX_SAMPLE_ROWS = 3;

export function verifyGrounding(input: VerifyInput): VerifyOutcome {
  const { execution, columnsUsed, profile, csvContent } = input;

  if (execution.exitCode !== 0) {
    return {
      ok: false,
      reason: "code_error",
      detail:
        execution.stderr.trim() ||
        `The analysis code exited with status ${execution.exitCode}.`,
    };
  }

  if (
    execution.value === null ||
    (typeof execution.value === "number" && !Number.isFinite(execution.value)) ||
    (typeof execution.value === "string" && execution.value.trim() === "")
  ) {
    return {
      ok: false,
      reason: "null_result",
      detail: "The code ran but did not produce a usable value.",
    };
  }

  const known = new Set(profile.columns.map((column) => column.name));
  const claimed = columnsUsed.filter((column) => column.trim() !== "");

  if (claimed.length === 0) {
    return {
      ok: false,
      reason: "not_grounded",
      detail: "The code did not report which columns it read, so the value cannot be traced.",
    };
  }

  const unknown = claimed.filter((column) => !known.has(column));
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: "not_grounded",
      detail: `The code claims it read ${unknown
        .map((c) => `"${c}"`)
        .join(", ")}, which ${unknown.length === 1 ? "is not a column" : "are not columns"} in this file.`,
    };
  }

  // Quote real cells from the real file for the columns actually used.
  const rows = parseCsv(csvContent);
  const [header = [], ...body] = rows;
  const indexOf = new Map(header.map((name, index) => [name, index]));
  const sampleCells: SourceCell[] = [];
  for (let row = 0; row < Math.min(MAX_SAMPLE_ROWS, body.length); row++) {
    for (const column of claimed) {
      const index = indexOf.get(column);
      if (index === undefined) continue;
      const value = body[row]?.[index];
      if (value !== undefined) sampleCells.push({ row, column, value });
    }
  }

  if (sampleCells.length === 0) {
    return {
      ok: false,
      reason: "not_grounded",
      detail: "No cells could be quoted back for the columns the code reported.",
    };
  }

  // Carry only PROVEN schema facts, and only ones relevant to what was read.
  const relevant = new Set(claimed);
  const schemaEvidence: SchemaEvidence[] = [
    ...profile.columns
      .filter((column) => relevant.has(column.name) && column.evidence !== null)
      .map((column) => column.evidence as SchemaEvidence),
    ...profile.crossChecks.filter((check) =>
      claimed.some((column) => check.claim.includes(`"${column}"`)),
    ),
  ].filter(isProven);

  return {
    ok: true,
    grounding: {
      columns: claimed,
      rowCount: profile.rowCount,
      rowRange: body.length > 0 ? [0, body.length - 1] : null,
      sampleCells,
      schemaEvidence,
    },
  };
}
