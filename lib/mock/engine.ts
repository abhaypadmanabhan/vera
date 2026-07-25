import { csvSchema } from "../csv";
import { isProven } from "../types";
import type {
  AnalysisRequest,
  Analyst,
  Finding,
  GeneratedCode,
  Grounding,
  ResolvedDataset,
  SchemaEvidence,
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

# OrderDate is DD/MM/YYYY (proven from the data, see the profile) — parsing it
# month-first would silently drop 5,952 of 9,994 rows.
df["OrderDate"] = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")

by_subcat = df.groupby("Sub-Category")["Profit"].sum()

print(round(by_subcat.min(), 2))`;

const MOCK_BROKEN_CODE = `import pandas as pd

df = pd.read_csv("/workspace/data.csv")
df["OrderDate"] = pd.to_datetime(df["OrderDate"])
print(df.groupby("Subcategory")["Profit"].sum().min())`;

function code(source: string, explanation: string): GeneratedCode {
  return {
    language: "python",
    source,
    explanation,
    lineCount: source.split("\n").length,
  };
}

/** Quote back real cells from whatever CSV is loaded, so the mock still looks honest. */
function groundingFrom(dataset: ResolvedDataset): Grounding {
  const schema = csvSchema(dataset.content, 3);
  const wanted = ["Sub-Category", "Profit", "OrderDate"];
  const columns = schema.columns.length > 0 ? schema.columns : wanted;
  const used = columns.filter((c) => wanted.includes(c));
  const usedColumns = used.length > 0 ? used : columns.slice(0, 4);

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
    // Real, counted proof from the profiler — not decoration.
    schemaEvidence: dataset.profile.columns
      .map((column) => column.evidence)
      .filter((evidence): evidence is SchemaEvidence => evidence !== null)
      .filter(isProven),
  };
}

const VERIFIED_FINDING = (dataset: ResolvedDataset, attempts: number): Finding => ({
  verdict: "verified",
  value: -17725.48,
  unit: "$",
  claim: "Tables lost more money than any other sub-category: -$17,725.48.",
  code: code(
    MOCK_CODE,
    "Parses OrderDate with the format proven from the data, then totals profit by sub-category.",
  ),
  execution: {
    exitCode: 0,
    stdout: "-17725.48\n",
    stderr: "",
    value: -17725.48,
    contextValues: {},
    durationMs: 1_284,
  },
  grounding: groundingFrom(dataset),
  attempts,
});

const UNVERIFIED_FINDING: Finding = {
  verdict: "unverified",
  reason: "retry_exhausted",
  detail:
    "Both attempts failed the same way: KeyError: 'Subcategory'. The column is named 'Sub-Category' in this file, and the generated code kept guessing the name instead of reading it off the schema.",
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
    const schema = csvSchema(request.dataset.content, 1);

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
      detail: "Exit 0 in 1.28s — stdout: -17725.48",
      attempt: 1,
    });

    yield stage({
      stage: "verifying",
      status: "active",
      detail: "Tracing -17725.48 back to source cells",
      attempt: 1,
    });
    await sleep(800);
    const finding = VERIFIED_FINDING(request.dataset, 1);
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
