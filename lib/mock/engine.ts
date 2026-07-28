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

/**
 * The code panel must describe the file on screen, not a file from another demo.
 * Built from the profile so an uploaded CSV never sees columns it does not have.
 */
function buildMockCode(dataset: ResolvedDataset, numericColumn: string | null): string {
  const dated = dataset.profile.columns.find(
    (column) => column.kind === "date" && column.dateFormat !== null,
  );
  const lines = ["import pandas as pd", "", 'df = pd.read_csv("/workspace/data.csv")'];

  if (dated?.dateFormat) {
    lines.push(
      "",
      `# ${dated.name} is ${dated.dateFormat} (proven from the data, see the profile).`,
      `df[${JSON.stringify(dated.name)}] = pd.to_datetime(df[${JSON.stringify(
        dated.name,
      )}], format=${JSON.stringify(dated.dateFormat)})`,
    );
  }

  if (!numericColumn) {
    lines.push("", "print(len(df))");
    return lines.join("\n");
  }

  /*
   * Strip the symbols before summing, because `numericTotal` below strips exactly
   * the same ones to get the number printed beside this code.
   *
   * A currency column is text to pandas: `df["Amount"].sum()` on "$1.00", "$2.00"
   * concatenates to "$1.00$2.00" and `round()` then raises TypeError. The panel
   * used to show that bare `.sum()` next to a total computed off the cleaned
   * values — a figure the code on screen could not have produced, which is the
   * one thing PRD §6 says we never do.
   */
  const column = JSON.stringify(numericColumn);
  lines.push(
    "",
    `df[${column}] = pd.to_numeric(`,
    `    df[${column}].astype(str).str.replace(r"[$,%\\s]", "", regex=True),`,
    '    errors="coerce",',
    ")",
    "",
    `print(round(df[${column}].sum(), 2))`,
  );
  return lines.join("\n");
}

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

/**
 * Quote back real cells from whatever CSV is loaded, so the mock still looks honest.
 *
 * `preferred` is the column the mock actually totalled. It used to be a fixed
 * Superstore list, which meant an uploaded file was grounded in whichever three
 * columns happened to come first.
 */
function groundingFrom(dataset: ResolvedDataset, preferred: string[] = []): Grounding {
  const schema = csvSchema(dataset.content, 3);
  const columns = schema.columns;
  const used = columns.filter((column) => preferred.includes(column));
  const usedColumns = used.length > 0 ? used : columns.slice(0, 4);

  const sampleCells: SourceCell[] = [];
  schema.sampleRows.forEach((row, rowIndex) => {
    usedColumns.forEach((column) => {
      const columnIndex = columns.indexOf(column);
      const value = columnIndex >= 0 ? row[columnIndex] : undefined;
      if (value !== undefined) sampleCells.push({ row: rowIndex, column, value });
    });
  });

  /*
   * However many rows the file has, including none.
   *
   * This used to fall back to 24 when the body was empty — a leftover from the
   * era of the one hardcoded Superstore answer. A header-only upload then
   * produced a "verified" finding claiming 24 records, with stdout `24`, that
   * nothing had counted.
   */
  const rowCount = schema.rowCount;
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

/**
 * Everything below is derived from the file that is actually loaded.
 *
 * The mock used to answer every question with one hardcoded Superstore figure,
 * so uploading any other file produced a deck describing columns that were not
 * in it. Mock mode is a surface the builder demos, and a demo that contradicts
 * the file on screen is worse than no demo.
 *
 * These numbers are arithmetic over the real cells, computed here in
 * TypeScript. That is honest ONLY because mock mode is labelled as mock
 * everywhere it renders and claims no sandbox execution (CLAUDE.md money rule,
 * definition-of-done §5). Nothing here may ever run outside `MOCK_MODE`.
 */

/** Turn a column name into something speakable: `date_added` → "date added". */
function humanize(column: string): string {
  return column.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/**
 * Columns whose NAME says they hold a measure rather than a code or a stamp.
 *
 * Taking simply the first numeric column meant Superstore's demo answer was the
 * sum of `OrderYear` — arithmetic that is real but means nothing, and a chart of
 * its parts means nothing either. A named measure is picked first; the old
 * first-numeric behaviour is still the fallback, so a file with no recognisable
 * measure answers exactly as it did before.
 */
const MEASURE_NAME =
  /(sales|revenue|profit|margin|amount|total|price|cost|spend|value|quantity|units|count)/i;

/**
 * A stamp or a key: numeric in the file, never a quantity to add up.
 *
 * Matched against the column's WORDS, not its raw text. As a substring this
 * pattern rejected real measures — `id` fires inside `paid_amount`, `month`
 * inside `monthly_revenue` — so the mock fell through to a worse column while
 * the name it skipped was exactly the measure being asked about.
 */
const NOT_A_MEASURE_WORD =
  /^(years?|months?|days?|dates?|ids?|codes?|zips?|postal|phones?|lat|lon|longitude|latitude|ranks?)$/i;

/** `OrderYear` -> ["Order", "Year"]; `paid_amount` -> ["paid", "amount"]. */
function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function isStampOrKey(name: string): boolean {
  return nameWords(name).some((word) => NOT_A_MEASURE_WORD.test(word));
}

function measureColumn(dataset: ResolvedDataset) {
  const numeric = dataset.profile.columns.filter(
    (column) => column.kind === "number" || column.kind === "integer",
  );
  return (
    numeric.find(
      (column) => MEASURE_NAME.test(column.name) && !isStampOrKey(column.name),
    ) ??
    numeric.find((column) => !isStampOrKey(column.name)) ??
    numeric[0] ??
    null
  );
}

/**
 * The column a breakdown is grouped by: a real category with enough distinct
 * values to be interesting and few enough to fit on a slide.
 */
function groupColumn(dataset: ResolvedDataset) {
  return (
    dataset.profile.columns.find(
      (column) =>
        column.kind === "category" && column.distinctCount >= 2 && column.distinctCount <= 12,
    ) ?? null
  );
}

interface Measured {
  column: string;
  total: number;
  count: number;
  /** Real subtotals of the same column, largest first. Empty when ungroupable. */
  breakdown: { key: string; column: string; total: number }[];
}

/**
 * One pass over the real cells: the total, the record count, and — when the file
 * has a category column — the subtotals of that same total.
 *
 * The subtotals are parts of the whole the headline reports, so they share its
 * unit and its axis. That is what makes the deck's comparison chart honest
 * rather than decorative.
 */
function numericTotal(dataset: ResolvedDataset): Measured | null {
  const numeric = measureColumn(dataset);
  if (!numeric) return null;

  const schema = csvSchema(dataset.content, Number.MAX_SAFE_INTEGER);
  const index = schema.columns.indexOf(numeric.name);
  if (index < 0) return null;

  const group = groupColumn(dataset);
  const groupIndex = group ? schema.columns.indexOf(group.name) : -1;
  const groups = new Map<string, number>();

  let total = 0;
  let count = 0;
  for (const row of schema.sampleRows) {
    const raw = row[index];
    if (raw === undefined) continue;
    const cleaned = raw.replace(/[$,%\s]/g, "");
    // An empty cell is not a zero. `Number("")` is 0 and finite, so a blank used
    // to land in `count` as well as `total`: a column of 10 and one blank
    // reported an average of 5 across "2 records", and the group it sat in got a
    // subtotal of 0 it had never reported. `to_numeric(errors="coerce")` in the
    // code panel drops the same cells.
    if (cleaned === "") continue;
    const value = Number(cleaned);
    if (!Number.isFinite(value)) continue;
    total += value;
    count += 1;

    if (groupIndex >= 0) {
      const key = row[groupIndex];
      if (key) groups.set(key, (groups.get(key) ?? 0) + value);
    }
  }
  if (count === 0) return null;

  const breakdown = [...groups.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([key, subtotal]) => ({
      key,
      column: group?.name ?? "",
      total: Math.round(subtotal * 100) / 100,
    }));

  return { column: numeric.name, total, count, breakdown };
}

const VERIFIED_FINDING = (dataset: ResolvedDataset, attempts: number): Finding => {
  const measured = numericTotal(dataset);
  const dateColumn = dataset.profile.columns.find(
    (column) => column.kind === "date" && column.dateFormat !== null,
  );
  /*
   * The category column is part of the grounding whenever there is a breakdown.
   * Every subtotal cites it in `columnsUsed`, so leaving it out meant the
   * headline had source cells under it and the figures printed beside the
   * headline had none — proof for the number the eye lands on, and nothing for
   * the ones it lands on next.
   */
  const groupedBy = measured?.breakdown[0]?.column;
  const grounding = groundingFrom(
    dataset,
    [measured?.column, dateColumn?.name, groupedBy].filter(
      (name): name is string => Boolean(name),
    ),
  );

  // No numeric column anywhere — fall back to counting records, which every
  // file can answer.
  if (!measured) {
    const rows = grounding.rowCount;
    return {
      verdict: "verified",
      value: rows,
      unit: null,
      claim: `There are ${rows.toLocaleString()} records in this file.`,
      code: code(
        buildMockCode(dataset, null),
        "Counts the rows after loading the file with the profiled schema.",
      ),
      execution: {
        exitCode: 0,
        stdout: `${rows}\n`,
        stderr: "",
        value: rows,
        contextValues: {},
        durationMs: 1_284,
      },
      grounding,
      context: [],
      valence: "neutral",
      attempts,
    };
  }

  const total = Math.round(measured.total * 100) / 100;
  const average = Math.round((measured.total / measured.count) * 100) / 100;
  const label = humanize(measured.column);

  return {
    verdict: "verified",
    value: total,
    unit: null,
    claim: `Total ${label} across the file comes to ${total.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })}.`,
    code: code(
      buildMockCode(dataset, measured.column),
      `Totals ${measured.column} after applying the profiled schema constraints.`,
    ),
    execution: {
      exitCode: 0,
      stdout: `${total}\n`,
      stderr: "",
      value: total,
      contextValues: {
        per_record: average,
        ...Object.fromEntries(measured.breakdown.map((part) => [part.key, part.total])),
      },
      durationMs: 1_284,
    },
    grounding,
    /*
     * Context figures for the "what it means" beat. The subtotals come first
     * because they are parts of the same total — same unit, same axis — so the
     * deck can plot them beside the headline. The per-record average is a
     * different quantity on a different scale; it stays available as a figure
     * and the chart's own spread guard keeps it off the axis.
     */
    context:
      measured.breakdown.length > 0
        ? measured.breakdown.map((part) => ({
            name: part.key,
            description: `the ${part.key} total`,
            value: part.total,
            columnsUsed: [measured.column, part.column],
          }))
        : [
            {
              name: "per_record",
              description: `the average across all ${measured.count.toLocaleString()} records`,
              value: average,
              columnsUsed: [measured.column],
            },
          ],
    valence: total < 0 ? "bad" : "good",
    attempts,
  };
};

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

    const verified = VERIFIED_FINDING(request.dataset, 1);
    const figure = verified.verdict === "verified" ? verified.value : null;
    const attemptCode = blocked
      ? MOCK_BROKEN_CODE
      : verified.verdict === "verified"
        ? verified.code.source
        : "";

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
      detail: `Exit 0 in 1.28s — stdout: ${String(figure)}`,
      attempt: 1,
    });

    yield stage({
      stage: "verifying",
      status: "active",
      detail: `Tracing ${String(figure)} back to source cells`,
      attempt: 1,
    });
    await sleep(800);
    const finding = verified;
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
