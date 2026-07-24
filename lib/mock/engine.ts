import { csvSchema } from "../csv";
import type {
  AnalysisRequest,
  Analyst,
  Finding,
  GeneratedCode,
  Grounding,
  SourceCell,
  StageEvent,
} from "../types";

/**
 * The mock analyst. Phase 1 runs the entire product through this with ZERO
 * external calls and ZERO API keys (CLAUDE.md money rule).
 *
 * It implements the same `Analyst` interface the real Fireworks + Daytona
 * orchestrator will, so swapping is one line in `lib/analyst.ts`.
 *
 * Two paths, both required by PRD §4.1:
 *   - happy: verified finding with code + grounding
 *   - blocked: attempt 1 fails, retry runs, run ends `unverified` with no number
 *
 * Trigger the blocked path by including "unverified" or "fail" in the question.
 */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const MOCK_CODE = `import pandas as pd

df = pd.read_csv("/workspace/data.csv")

# revenue arrives as a mix of numbers and strings like "$12,400"
df["revenue"] = (
    df["revenue"].astype(str).str.replace(r"[$,]", "", regex=True).astype(float)
)
df["cogs"] = pd.to_numeric(df["cogs"], errors="coerce")

q3 = df[df["month"].str.contains("2025-0[789]", na=False)]
margin = (q3["revenue"].sum() - q3["cogs"].sum()) / q3["revenue"].sum() * 100

print(round(margin, 1))`;

const MOCK_BROKEN_CODE = `import pandas as pd

df = pd.read_csv("/workspace/data.csv")
margin = (df["revenue"].sum() - df["cogs"].sum()) / df["revenue"].sum()
print(round(margin * 100, 1))`;

function code(source: string, explanation: string): GeneratedCode {
  return {
    language: "python",
    source,
    explanation,
    lineCount: source.split("\n").length,
  };
}

/** Quote back real cells from whatever CSV is loaded, so the mock still looks honest. */
function groundingFrom(csvContent: string): Grounding {
  const schema = csvSchema(csvContent, 3);
  const columns = schema.columns.length > 0 ? schema.columns : ["month", "revenue", "cogs"];
  const used = columns.filter((c) => ["month", "revenue", "cogs"].includes(c));
  const usedColumns = used.length > 0 ? used : columns.slice(0, 3);

  const sampleCells: SourceCell[] = [];
  schema.sampleRows.forEach((row, rowIndex) => {
    usedColumns.forEach((column) => {
      const columnIndex = columns.indexOf(column);
      const value = columnIndex >= 0 ? row[columnIndex] : undefined;
      if (value !== undefined) sampleCells.push({ row: rowIndex, column, value });
    });
  });

  const rowCount = schema.rowCount > 0 ? schema.rowCount : 24;
  return {
    columns: usedColumns,
    rowCount,
    rowRange: [0, Math.max(rowCount - 1, 0)],
    sampleCells,
  };
}

const VERIFIED_FINDING = (csvContent: string, attempts: number): Finding => ({
  verdict: "verified",
  value: 41.2,
  unit: "%",
  claim: "Q3 2025 gross margin was 41.2%, down from 47.8% in Q2.",
  code: code(MOCK_CODE, "Cleans the currency column, filters to Q3 2025, and computes gross margin."),
  execution: {
    exitCode: 0,
    stdout: "41.2\n",
    stderr: "",
    value: 41.2,
    durationMs: 1_284,
  },
  grounding: groundingFrom(csvContent),
  attempts,
});

const UNVERIFIED_FINDING: Finding = {
  verdict: "unverified",
  reason: "retry_exhausted",
  detail:
    'Both attempts failed on the same column: TypeError: unsupported operand type(s) for -: \'str\' and \'float\'. The revenue column mixes numbers with strings like "$12,400" and the generated code did not clean it.',
  code: code(MOCK_BROKEN_CODE, "Attempted a direct margin calculation without cleaning the currency column."),
  attempts: 2,
};

function wantsBlockedPath(question: string): boolean {
  return /\bunverified\b|\bfail\b|\bbreak\b/i.test(question);
}

export const mockAnalyst: Analyst = {
  async *run(request: AnalysisRequest): AsyncIterable<StageEvent> {
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;
    const blocked = wantsBlockedPath(request.question);
    const schema = csvSchema(request.csv.content, 1);

    type StageFields = Omit<Extract<StageEvent, { type: "stage" }>, "type" | "elapsedMs">;
    const stage = (fields: StageFields): StageEvent => ({
      type: "stage",
      ...fields,
      elapsedMs: elapsed(),
    });

    const attemptCode = blocked ? MOCK_BROKEN_CODE : MOCK_CODE;

    // ── attempt 1 ────────────────────────────────────────────────────────────
    yield stage({
      stage: "writing_code",
      status: "active",
      detail: `Reading ${schema.columns.length} columns × ${schema.rowCount} rows`,
      attempt: 1,
    });
    await sleep(900);
    yield stage({
      stage: "writing_code",
      status: "complete",
      detail: `Generated ${attemptCode.split("\n").length} lines of pandas`,
      attempt: 1,
    });

    yield stage({
      stage: "running_sandbox",
      status: "active",
      detail: "Warm sandbox ready in 0.4s — uploading data.csv",
      attempt: 1,
    });
    await sleep(1_100);

    if (blocked) {
      yield stage({
        stage: "running_sandbox",
        status: "failed",
        detail: "TypeError on column 'revenue' — feeding stderr back to the model",
        attempt: 1,
      });

      // ── attempt 2 (the retry, visible in the UI) ───────────────────────────
      await sleep(400);
      yield stage({
        stage: "writing_code",
        status: "active",
        detail: "Attempt 2 — rewriting with the error in context",
        attempt: 2,
      });
      await sleep(900);
      yield stage({
        stage: "writing_code",
        status: "complete",
        detail: "Generated 6 lines of pandas",
        attempt: 2,
      });
      yield stage({
        stage: "running_sandbox",
        status: "active",
        detail: "Re-running in the sandbox",
        attempt: 2,
      });
      await sleep(1_000);
      yield stage({
        stage: "running_sandbox",
        status: "failed",
        detail: "Same TypeError on column 'revenue'",
        attempt: 2,
      });
      yield stage({
        stage: "verifying",
        status: "failed",
        detail: "No value to trace — blocking the answer",
        attempt: 2,
      });
      yield { type: "finding", finding: UNVERIFIED_FINDING, elapsedMs: elapsed() };
      return;
    }

    yield stage({
      stage: "running_sandbox",
      status: "complete",
      detail: "Exit 0 in 1.28s — stdout: 41.2",
      attempt: 1,
    });

    yield stage({
      stage: "verifying",
      status: "active",
      detail: "Tracing 41.2 back to source cells",
      attempt: 1,
    });
    await sleep(800);
    const finding = VERIFIED_FINDING(request.csv.content, 1);
    const grounding = finding.verdict === "verified" ? finding.grounding : null;
    yield stage({
      stage: "verifying",
      status: "complete",
      detail: grounding
        ? `Grounded in ${grounding.columns.join(", ")} across ${grounding.rowCount} rows`
        : "Grounded",
      attempt: 1,
    });

    yield stage({
      stage: "done",
      status: "complete",
      detail: "Verified",
      attempt: 1,
    });
    yield { type: "finding", finding, elapsedMs: elapsed() };
  },
};
