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

/** A single cell of the real CSV, quoted back as evidence. */
export interface SourceCell {
  /** 0-based row index in the parsed CSV, excluding the header. */
  row: number;
  column: string;
  value: string;
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
  durationMs: number;
}

/** Why a run could not be verified. Rendered verbatim in the unverified card. */
export type BlockReason =
  | "code_error"
  | "null_result"
  | "not_grounded"
  | "retry_exhausted"
  | "timeout"
  | "upstream_error";

export const BLOCK_REASON_COPY: Record<BlockReason, string> = {
  code_error: "The analysis code failed to run.",
  null_result: "The code ran but produced no usable value.",
  not_grounded: "The result could not be traced back to real cells in your data.",
  retry_exhausted: "Two attempts were made and neither produced a traceable number.",
  timeout: "The analysis took too long and was stopped.",
  upstream_error: "A service Vera depends on did not respond.",
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

export interface AnalysisRequest {
  question: string;
  csv: CsvPayload;
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
