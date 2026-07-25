/**
 * Vera domain contract.
 *
 * This file is the seam between the mock spine (Phase 1) and the real
 * Fireworks + Daytona orchestrator (Phases 2-4). Both implement `Analyst`.
 * If you are adding a real integration, implement this — do not change it.
 *
 * See PRD.md §3 (architecture) and §6 (the honest definition of "verified").
 */

/** The four stages that stream to the UI timeline. PRD §3. */
export type StageId = "writing_code" | "running_sandbox" | "verifying" | "done";

export const STAGE_ORDER: readonly StageId[] = [
  "writing_code",
  "running_sandbox",
  "verifying",
  "done",
] as const;

export const STAGE_LABELS: Record<StageId, string> = {
  writing_code: "Writing code",
  running_sandbox: "Running in sandbox",
  verifying: "Verifying",
  done: "Done",
};

export type StageStatus = "pending" | "active" | "complete" | "failed";

/**
 * The gate. A union, never a boolean and never optional — see `Finding`:
 * an unverified finding structurally cannot carry a number.
 */
export type Verdict = "verified" | "unverified";

export type Valence = "good" | "bad" | "neutral";

export interface ContextFigure {
  /** Machine key matching the executed payload, for example "prior_period". */
  name: string;
  /** Plain-English description suitable for narration. */
  description: string;
  value: number | string;
  /** Columns this figure was computed from. */
  columnsUsed: string[];
}

/** A single cell of the real CSV, quoted back as evidence. */
export interface SourceCell {
  /** 0-based row index in the parsed CSV, excluding the header. */
  row: number;
  column: string;
  value: string;
}

/**
 * Evidence for a schema fact Vera INFERRED from the data.
 *
 * Rule: never assert an inferred fact without the counts that prove it. This is
 * deterministic inference with shown evidence — it is NOT a claim that Vera can
 * detect a subtly-wrong-but-runnable answer, which PRD §6 explicitly disclaims.
 * Do not blur the two in code, copy, or the README.
 */
export interface SchemaEvidence {
  /** "OrderDate is DD/MM/YYYY" */
  claim: string;
  /** Rows that can only be explained by this claim. */
  supportingRows: number;
  /** Rows that argue against it. */
  contradictingRows: number;
  /** Real values from the column, quoted back. */
  examples: string[];
  /** Plain English: "5,952 values have a first component above 12, which cannot be a month." */
  method: string;
}

/**
 * A claim is PROVEN only when something actually supports it and nothing contradicts it.
 *
 * Checking `contradictingRows === 0` alone is a bug: a column where every value reads
 * validly both ways yields 0 and 0 — no contradiction, but no proof either. Never act
 * on a claim, or show it as established, unless this returns true.
 */
export function isProven(evidence: SchemaEvidence): boolean {
  return evidence.supportingRows > 0 && evidence.contradictingRows === 0;
}

/** Proof that a value came from real cells and not from the model's imagination. */
export interface Grounding {
  /** Columns the executed code actually read. */
  columns: string[];
  /** How many rows the computation touched. */
  rowCount: number;
  /** Inclusive 0-based row range touched, when contiguous. */
  rowRange: [number, number] | null;
  /** A handful of real cells to render under the number. */
  sampleCells: SourceCell[];
  /** Inferred schema facts the analysis relied on, each with its proof. */
  schemaEvidence: SchemaEvidence[];
}

export type ColumnKind = "integer" | "number" | "date" | "category" | "text" | "id";

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  nullCount: number;
  distinctCount: number;
  sampleValues: string[];
  /** strftime format, set only when `kind === "date"` and the format was PROVEN. */
  dateFormat: string | null;
  /** The proof behind `dateFormat`, or any other inferred fact about this column. */
  evidence: SchemaEvidence | null;
}

/**
 * What the profiler learns about a dataset before any model sees it.
 * This is what goes into the codegen prompt — never the whole file.
 */
export interface DatasetProfile {
  datasetId: string;
  filename: string;
  rowCount: number;
  columns: ColumnProfile[];
  duplicateRowCount: number;
  /**
   * Convenience period columns (Year / Quarter / Month) checked against the date
   * column we proved. A stated column that disagrees with the real dates is the
   * dangerous case: code using it runs clean and returns a wrong number.
   */
  crossChecks: SchemaEvidence[];
  /** Facts the generated code MUST respect, in plain English, for the prompt. */
  notes: string[];
}

/** The analysis code Fireworks wrote (Phase 2) — or the mock's stand-in. */
export interface GeneratedCode {
  language: "python";
  /** The exact source that was executed. Never reformat between run and display. */
  source: string;
  /** One sentence, plain English, for the "what this does" line. */
  explanation: string;
  lineCount: number;
}

/** What came back from the Daytona sandbox (Phase 3). */
export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Parsed single result value, or null when the code produced nothing usable. */
  value: number | string | null;
  /** Extra executed figures from the same result line. Empty when none. */
  contextValues: Record<string, number | string>;
  durationMs: number;
}

/** Why a run could not be verified. Rendered verbatim in the unverified card. */
export type BlockReason =
  | "code_error"
  | "null_result"
  | "not_grounded"
  | "retry_exhausted"
  | "timeout"
  | "upstream_error"
  | "question_not_answerable";

export const BLOCK_REASON_COPY: Record<BlockReason, string> = {
  code_error: "The analysis code failed to run.",
  null_result: "The code ran but produced no usable value.",
  not_grounded: "The result could not be traced back to real cells in your data.",
  retry_exhausted: "Two attempts were made and neither produced a traceable number.",
  timeout: "The analysis took too long and was stopped.",
  upstream_error: "A service Vera depends on did not respond.",
  question_not_answerable: "Vera chose not to answer this from this file.",
};

/**
 * The product, in one type.
 *
 * `verified` carries a number. `unverified` structurally cannot — there is no
 * `value` field on that branch, so no code path can leak an unproven number to
 * the UI. Keep it that way (PRD §4.4, §6).
 */
export type Finding =
  | {
      verdict: "verified";
      /** The number Vera will say out loud. */
      value: number | string;
      /** e.g. "$", "%", "units" — display only. */
      unit: string | null;
      /** One line of plain English: "Q3 gross margin in EMEA was 41.2%." */
      claim: string;
      code: GeneratedCode;
      execution: ExecutionResult;
      grounding: Grounding;
      /** Extra grounded figures for the "what it means" beat. Empty is normal. */
      context: ContextFigure[];
      /** Tone only: it selects how Vera opens and carries no figure. */
      valence: Valence;
      attempts: number;
    }
  | {
      verdict: "unverified";
      reason: BlockReason;
      /** Human-readable detail: the stderr tail, or what was missing. */
      detail: string;
      /** The code that was attempted, when there was any. */
      code: GeneratedCode | null;
      attempts: number;
    };

/** Events streamed from `/api/analyze` to the timeline. */
export type StageEvent =
  | {
      type: "stage";
      stage: StageId;
      status: StageStatus;
      /** Live detail line so the demo is never silent. PRD §7. */
      detail: string;
      /** 1-based; >1 means the retry loop is visible in the UI. PRD §4.2. */
      attempt: number;
      /** ms since run start. */
      elapsedMs: number;
    }
  | { type: "finding"; finding: Finding; elapsedMs: number }
  | { type: "error"; message: string; elapsedMs: number };

export interface CsvPayload {
  filename: string;
  /** Raw file text. Phase 3 writes this into the sandbox. */
  content: string;
}

/**
 * What the browser POSTs. The demo CSV is 2.3 MB and lives on the SERVER — it
 * never crosses the wire. The client sends a key; only a user upload sends bytes.
 */
export interface AnalyzeWirePayload {
  question: string;
  datasetId: string;
  /** Present only when the user uploaded their own file. */
  upload?: CsvPayload;
}

/** A dataset the server has read off disk (or accepted as an upload) and profiled. */
export interface ResolvedDataset {
  id: string;
  filename: string;
  /** Full file text. Server-side only — never send this to the client. */
  content: string;
  profile: DatasetProfile;
}

export interface AnalysisRequest {
  question: string;
  dataset: ResolvedDataset;
  /** Prepared sandbox artifact; absent when prep did not run or failed open. */
  analysisPath?: string;
}

/** The safe subset of a dataset the client may receive: schema + preview, no bulk rows. */
export interface DatasetSummary {
  id: string;
  filename: string;
  rowCount: number;
  columns: ColumnProfile[];
  duplicateRowCount: number;
  notes: string[];
  /** First handful of rows, for the preview table only. */
  previewRows: string[][];
  sizeBytes: number;
}

/**
 * The one interface both the mock engine and the real orchestrator implement.
 * Swapping mock -> real is a single line in `lib/analyst.ts`.
 */
export interface Analyst {
  run(request: AnalysisRequest): AsyncIterable<StageEvent>;
}

/** Lightweight parsed view of a CSV, used by the UI and (later) the codegen prompt. */
export interface CsvSchema {
  columns: string[];
  rowCount: number;
  /** First few rows, as raw strings, for display and for the model prompt. */
  sampleRows: string[][];
}
