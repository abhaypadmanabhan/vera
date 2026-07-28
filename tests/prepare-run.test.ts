import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrepare, type PrepState } from "@/components/vera/use-prep";
import type { CodeExecutor } from "@/lib/codegen/retry";
import { LIMITS } from "@/lib/config";
import { contentHash } from "@/lib/datasets";
import {
  buildAuditProgram,
  parseAuditOutput,
} from "@/lib/prepare/audit";
import type { PrepOutput, PrepRequest } from "@/lib/prepare/generate";
import {
  prepareDataset,
  type PrepProgressEvent,
} from "@/lib/prepare/run";
import { getPrep, setPrep } from "@/lib/prepare/store";
import type { ExecutionResult, ResolvedDataset } from "@/lib/types";
import {
  CLEAN_CSV_PATH,
  SANDBOX_CSV_PATH,
  teardownSandbox,
} from "@/lib/daytona/sandbox";

async function executeAudit(
  sourceCsv: string,
  cleanCsv: string,
): Promise<ReturnType<typeof parseAuditOutput>> {
  const directory = await mkdtemp(join(tmpdir(), "vera-audit-"));
  const sourcePath = join(directory, "source.csv");
  const cleanPath = join(directory, "clean.csv");

  try {
    await Promise.all([
      writeFile(sourcePath, sourceCsv, "utf8"),
      writeFile(cleanPath, cleanCsv, "utf8"),
    ]);
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "python3",
        ["-c", buildAuditProgram(sourcePath, cleanPath)],
        { encoding: "utf8" },
        (error, output) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(output);
        },
      );
    });
    return parseAuditOutput(stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function executeAuditAndReadClean(
  sourceCsv: string,
  cleanCsv: string,
): Promise<{
  counts: ReturnType<typeof parseAuditOutput>;
  clean: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "vera-audit-result-"));
  const sourcePath = join(directory, "source.csv");
  const cleanPath = join(directory, "clean.csv");

  try {
    await Promise.all([
      writeFile(sourcePath, sourceCsv, "utf8"),
      writeFile(cleanPath, cleanCsv, "utf8"),
    ]);
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "python3",
        ["-c", buildAuditProgram(sourcePath, cleanPath)],
        { encoding: "utf8" },
        (error, output) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(output);
        },
      );
    });
    return {
      counts: parseAuditOutput(stdout),
      clean: await readFile(cleanPath, "utf8"),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("the audit program", () => {
  it("reads both files and emits the audit prefix", () => {
    const program = buildAuditProgram(
      "/workspace/data.csv",
      "/workspace/clean.csv",
    );

    expect(program).toContain("/workspace/data.csv");
    expect(program).toContain("/workspace/clean.csv");
    expect(program).toContain("VERA_AUDIT:");
  });

  /*
   * Macroscope on PR #41. `prepared.drop_duplicates()` de-duplicated the
   * COERCED frame, so two genuinely different source records — `$1000` and
   * `1000` — became identical during prep and one was destroyed, reported as an
   * exact repeat. Prep must only ever remove rows that were already duplicates
   * in the file the user handed over.
   */
  it("keeps rows that only became identical during prep", async () => {
    // The two records differ ONLY in the column prep coerces, so after
    // coercion they are byte-identical rows — the case drop_duplicates() ate.
    const source = "id,amount\nA,$1000\nA,1000\n";
    const clean = "id,amount\nA,1000\nA,1000\n";

    const { counts, clean: written } = await executeAuditAndReadClean(
      source,
      clean,
    );

    expect(counts?.duplicatesDropped).toBe(0);
    expect(counts?.rowsAfter).toBe(2);
    // Both source records survive: two body rows plus the header.
    expect(written.trim().split("\n")).toHaveLength(3);
  });

  it("still drops a row that was an exact repeat in the source", async () => {
    const source = "id,amount\nA,1000\nA,1000\nB,2000\n";
    const clean = "id,amount\nA,1000\nA,1000\nB,2000\n";

    const { counts } = await executeAuditAndReadClean(source, clean);

    expect(counts?.duplicatesDropped).toBe(1);
    expect(counts?.rowsAfter).toBe(2);
  });

  it("parses the counts from the last audit line", () => {
    const stdout = [
      'VERA_AUDIT:{"rowsBefore":1,"rowsAfter":1,"duplicatesDropped":0,"cellsCoerced":0}',
      "some unrelated output",
      'VERA_AUDIT:{"rowsBefore":9994,"rowsAfter":9990,"duplicatesDropped":4,"cellsCoerced":12}',
    ].join("\n");

    expect(parseAuditOutput(stdout)).toEqual({
      rowsBefore: 9994,
      rowsAfter: 9990,
      duplicatesDropped: 4,
      cellsCoerced: 12,
    });
  });

  it("removes exact duplicates and reports the positive count", async () => {
    const csv = "name,amount\nAlpha,10\nAlpha,10\nBeta,20\n";

    await expect(executeAuditAndReadClean(csv, csv)).resolves.toEqual({
      counts: {
        rowsBefore: 3,
        rowsAfter: 2,
        duplicatesDropped: 1,
        cellsCoerced: 0,
      },
      clean: "name,amount\nAlpha,10\nBeta,20\n",
    });
  });

  it("counts row-preserving whitespace and numeric coercions positionally", async () => {
    const source = "id,name,amount\n1, Alpha ,$10\n2,Beta,20\n";
    const prepared = "id,name,amount\n1,Alpha,10\n2,Beta,20\n";

    await expect(executeAudit(source, prepared)).resolves.toEqual({
      rowsBefore: 2,
      rowsAfter: 2,
      duplicatesDropped: 0,
      cellsCoerced: 2,
    });
  });

  it("measures shared cells and added columns separately", async () => {
    const source = "kind,duration\nMovie, 90 min \nSeries,2 Seasons\n";
    const prepared = [
      "kind,duration,duration_amount,duration_unit",
      "Movie,90 min,90,min",
      "Series,2 Seasons,2,Seasons",
    ].join("\n");

    await expect(executeAudit(source, prepared)).resolves.toEqual({
      rowsBefore: 2,
      rowsAfter: 2,
      duplicatesDropped: 0,
      cellsCoerced: 1,
      columnsAdded: 2,
    });
  });

  it("still withholds counts when rows reorder alongside an added column", async () => {
    const source = "id,value\n1,Alpha\n2,Beta\n";
    const prepared = "id,value,value_list\n2,Beta,Beta\n1,Alpha,Alpha\n";

    await expect(executeAudit(source, prepared)).resolves.toBeNull();
  });

  it("withholds counts when an exact duplicate disappears", async () => {
    const source = "name,amount\nAlpha,10\nBeta,20\nBeta,20\nGamma,30\n";
    const clean = "name,amount\nAlpha,10\nBeta,20\nGamma,30\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when deletion can hide coercion then deduplication", async () => {
    const source = "value\nA\nA\nB\n";
    const clean = "value\nA\nB\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts for reordered rows", async () => {
    const source = "name,amount\nAlpha,10\nBeta,20\nGamma,30\n";
    const clean = "name,amount\nGamma,30\nAlpha,10\nBeta,20\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("counts whitespace normalization in row order", async () => {
    const source = "id,name,amount\n1, Alpha ,10\n2,Beta,20\n";
    const clean = "id,name,amount\n1,Alpha,10\n2,Beta,20\n";

    await expect(executeAudit(source, clean)).resolves.toEqual({
      rowsBefore: 2,
      rowsAfter: 2,
      duplicatesDropped: 0,
      cellsCoerced: 1,
    });
  });

  it("withholds counts when normalization and duplicate removal are ambiguous", async () => {
    const source = "group,amount\n1,$1\n1,1\n";
    const clean = "group,amount\n1,1\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when values swap between ID-looking rows", async () => {
    const source = "id,value\n1,Alpha\n2,Beta\n";
    const clean = "id,value\n1,Beta\n2,Alpha\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when deletion and coercion need row identity", async () => {
    const source = "id,value\n1,Alpha\n2,Beta\n3,Gamma\n";
    const clean = "id,value\n1,Alpha\n3,Delta\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when trimmed IDs collide before deduplication", async () => {
    const source = "id,value\n 1,Alpha\n1,Alpha\n";
    const clean = "id,value\n1,Alpha\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("counts positional changes that the prep whitelist controls", async () => {
    const source = "group,value\nA,10\nA,20\n";
    const clean = "group,value\nA,11\nA,20\n";

    await expect(executeAudit(source, clean)).resolves.toEqual({
      rowsBefore: 2,
      rowsAfter: 2,
      duplicatesDropped: 0,
      cellsCoerced: 1,
    });
  });

  it.each([
    ["missing prefix", "boom"],
    ["malformed JSON", "VERA_AUDIT:{oops"],
    [
      "partial counts",
      'VERA_AUDIT:{"rowsBefore":10,"rowsAfter":9,"duplicatesDropped":1}',
    ],
    [
      "wrong value type",
      'VERA_AUDIT:{"rowsBefore":"lots","rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":2}',
    ],
    ["non-object JSON", "VERA_AUDIT:null"],
    [
      "non-finite value",
      'VERA_AUDIT:{"rowsBefore":1e999,"rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":2}',
    ],
  ])("returns null for %s", (_case, stdout) => {
    expect(parseAuditOutput(stdout)).toBeNull();
  });

  it.each([
    [
      "negative counts",
      '{"rowsBefore":10,"rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":-1}',
    ],
    [
      "fractional counts",
      '{"rowsBefore":10,"rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":1.5}',
    ],
    [
      "unsafe integers",
      '{"rowsBefore":9007199254740992,"rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":1}',
    ],
    [
      "more rows after than before",
      '{"rowsBefore":9,"rowsAfter":10,"duplicatesDropped":0,"cellsCoerced":1}',
    ],
    [
      "more duplicates dropped than rows removed",
      '{"rowsBefore":10,"rowsAfter":9,"duplicatesDropped":2,"cellsCoerced":1}',
    ],
  ])("rejects %s", (_case, payload) => {
    expect(parseAuditOutput(`VERA_AUDIT:${payload}`)).toBeNull();
  });
});

const DATASET: ResolvedDataset = {
  id: "tiny-sales",
  filename: "tiny-sales.csv",
  content: [
    "Region,Sales",
    "West,10",
    "East,20",
    "North,30",
    "South,40",
    "Central,50",
    "Other,60",
  ].join("\n"),
  profile: {
    datasetId: "tiny-sales",
    filename: "tiny-sales.csv",
    rowCount: 6,
    duplicateRowCount: 0,
    crossChecks: [],
    columns: [
      {
        name: "Region",
        kind: "category",
        nullCount: 0,
        distinctCount: 6,
        sampleValues: ["West", "East"],
        dateFormat: null,
        evidence: null,
      },
      {
        name: "Sales",
        kind: "number",
        nullCount: 0,
        distinctCount: 6,
        sampleValues: ["10", "20"],
        dateFormat: null,
        evidence: null,
      },
    ],
    notes: [],
  },
};

function cleanPathFor(dataset: ResolvedDataset): string {
  return CLEAN_CSV_PATH.replace(
    /\.csv$/,
    `-${contentHash(dataset.content)}.csv`,
  );
}

function execution(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    value: null,
    contextValues: {},
    durationMs: 1,
    ...overrides,
  };
}

function successfulExecutor(
  requests: Parameters<CodeExecutor["execute"]>[0][] = [],
): CodeExecutor {
  let call = 0;
  return {
    async execute(request) {
      requests.push(request);
      call++;
      return call === 1
        ? execution()
        : execution({
            stdout:
              'VERA_AUDIT:{"rowsBefore":6,"rowsAfter":6,"duplicatesDropped":0,"cellsCoerced":0}',
          });
    },
  };
}

describe("prepareDataset", () => {
  it("reports truthful cleaning and checking boundaries", async () => {
    const timeline: string[] = [];
    let executions = 0;

    await prepareDataset(DATASET, {
      mockMode: false,
      loader: async () => {
        timeline.push("load");
      },
      reader: async () => DATASET.content,
      generator: async () => {
        timeline.push("generate");
        return {
          prepCode: "clean()",
          fixes: ["Tidied the file."],
          questions: ["What is the total Sales?"],
        };
      },
      executor: {
        async execute() {
          executions++;
          timeline.push(executions === 1 ? "execute:clean" : "execute:audit");
          return executions === 1
            ? execution()
            : execution({
                stdout:
                  'VERA_AUDIT:{"rowsBefore":6,"rowsAfter":6,"duplicatesDropped":0,"cellsCoerced":0}',
              });
        },
      },
      onProgress: ({ stage, status }: PrepProgressEvent) => {
        timeline.push(`${stage}:${status}`);
      },
    });

    expect(timeline).toEqual([
      "cleaning:active",
      "load",
      "generate",
      "execute:clean",
      "cleaning:complete",
      "checking:active",
      "execute:audit",
      "checking:complete",
    ]);
  });

  it("reports cleaning failed without starting checks when cleaning fails", async () => {
    const progress: PrepProgressEvent[] = [];

    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor: {
        async execute() {
          return execution({ exitCode: 1 });
        },
      },
      onProgress: (event: PrepProgressEvent) => progress.push(event),
    });

    expect(report.ok).toBe(false);
    expect(progress.map(({ stage, status }) => [stage, status])).toEqual([
      ["cleaning", "active"],
      ["cleaning", "failed"],
    ]);
  });

  it("reports checking failed when the fixed audit throws", async () => {
    const progress: PrepProgressEvent[] = [];
    let calls = 0;

    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor: {
        async execute() {
          calls++;
          if (calls === 1) return execution();
          throw new Error("audit failed");
        },
      },
      onProgress: (event: PrepProgressEvent) => progress.push(event),
    });

    expect(report).toMatchObject({
      ok: true,
      analysisPath: cleanPathFor(DATASET),
      counts: null,
    });
    expect(progress.map(({ stage, status }) => [stage, status])).toEqual([
      ["cleaning", "active"],
      ["cleaning", "complete"],
      ["checking", "active"],
      ["checking", "failed"],
    ]);
  });

  it("reports checking failed when the fixed audit exits unsuccessfully", async () => {
    const progress: PrepProgressEvent[] = [];
    let calls = 0;

    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor: {
        async execute() {
          calls++;
          return calls === 1
            ? execution()
            : execution({ exitCode: 1 });
        },
      },
      onProgress: (event: PrepProgressEvent) => progress.push(event),
    });

    expect(report).toMatchObject({
      ok: true,
      analysisPath: cleanPathFor(DATASET),
      counts: null,
    });
    expect(progress.map(({ stage, status }) => [stage, status])).toEqual([
      ["cleaning", "active"],
      ["cleaning", "complete"],
      ["checking", "active"],
      ["checking", "failed"],
    ]);
  });

  it("returns the clean path and measured counts on the happy path", async () => {
    const requests: Parameters<CodeExecutor["execute"]>[0][] = [];

    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor: successfulExecutor(requests),
    });

    expect(report).toMatchObject({
      ok: true,
      analysisPath: cleanPathFor(DATASET),
      counts: {
        rowsBefore: 6,
        rowsAfter: 6,
        duplicatesDropped: 0,
        cellsCoerced: 0,
      },
    });
    expect(report.questions.length).toBeGreaterThan(0);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      csvPath: SANDBOX_CSV_PATH,
    });
    expect(requests[1]?.code).toBe(
      buildAuditProgram(SANDBOX_CSV_PATH, cleanPathFor(DATASET)),
    );
    expect(requests.every((request) => request.signal instanceof AbortSignal)).toBe(
      true,
    );
  });

  /*
   * Macroscope on PR #41, and a money finding. `timeoutMs` is a PER-CALL cap
   * and a prep run makes two calls, so passing the whole-run budget let one
   * stuck cleaning plus one stuck audit bill ~180s of paid sandbox time against
   * a documented 90s budget.
   */
  it("caps each sandbox call at the per-execution timeout", async () => {
    const requests: Parameters<CodeExecutor["execute"]>[0][] = [];

    await prepareDataset(DATASET, {
      mockMode: true,
      executor: successfulExecutor(requests),
    });

    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.timeoutMs)).toEqual([
      LIMITS.executionTimeoutMs,
      LIMITS.executionTimeoutMs,
    ]);
    // Every call a prep run makes, added up, still fits the budget it claims.
    expect(
      requests.reduce((total, request) => total + request.timeoutMs, 0),
    ).toBeLessThanOrEqual(LIMITS.runBudgetMs);
  });

  it("re-profiles the cleaned file after prep adds mixed-unit columns", async () => {
    const mixedUnits: ResolvedDataset = {
      ...DATASET,
      id: "catalog",
      filename: "catalog.csv",
      content: "kind,duration\nMovie,90 min\nSeries,2 Seasons\n",
      profile: {
        ...DATASET.profile,
        datasetId: "catalog",
        filename: "catalog.csv",
        rowCount: 2,
        columns: [
          {
            name: "kind",
            kind: "category",
            nullCount: 0,
            distinctCount: 2,
            sampleValues: ["Movie", "Series"],
            dateFormat: null,
            evidence: null,
          },
          {
            name: "duration",
            kind: "text",
            nullCount: 0,
            distinctCount: 2,
            sampleValues: ["90 min", "2 Seasons"],
            dateFormat: null,
            evidence: null,
          },
        ],
      },
    };
    const report = await prepareDataset(mixedUnits, { mockMode: true });

    expect(
      report.analysisProfile?.columns.map((column) => column.name),
    ).toContain("duration_amount");
    expect(report.counts).toMatchObject({
      rowsBefore: 2,
      rowsAfter: 2,
      duplicatesDropped: 0,
      columnsAdded: 2,
    });
  });

  it("keeps mock fixes and measured cleanup counts consistent", async () => {
    const percentages: ResolvedDataset = {
      ...DATASET,
      id: "rates",
      filename: "rates.csv",
      content: "rate\n10%\n25%\n",
      profile: {
        ...DATASET.profile,
        datasetId: "rates",
        filename: "rates.csv",
        rowCount: 2,
        columns: [
          {
            name: "rate",
            kind: "number",
            nullCount: 0,
            distinctCount: 2,
            sampleValues: ["10%", "25%"],
            dateFormat: null,
            evidence: null,
          },
        ],
      },
    };

    const report = await prepareDataset(percentages, { mockMode: true });

    expect(report.counts?.cellsCoerced).toBe(2);
    expect(
      report.analysisProfile?.columns[0]?.sampleValues,
    ).toEqual(["10", "25"]);
    expect(report.fixes).toContain(
      "Symbols and separators around amounts will be removed.",
    );
  });

  it("uses only the first five parsed data rows when generating prep", async () => {
    let received: PrepRequest | undefined;
    const generator = async (request: PrepRequest): Promise<PrepOutput> => {
      received = request;
      return {
        prepCode: "clean()",
        fixes: ["Tidied the file."],
        questions: ["What is the total Sales?"],
      };
    };

    await prepareDataset(DATASET, {
      mockMode: true,
      executor: successfulExecutor(),
      generator,
    });

    expect(received).toMatchObject({
      profile: DATASET.profile,
      sampleRows: [
        ["West", "10"],
        ["East", "20"],
        ["North", "30"],
        ["South", "40"],
        ["Central", "50"],
      ],
      sourcePath: SANDBOX_CSV_PATH,
      cleanPath: cleanPathFor(DATASET),
    });
  });

  it("drops every proposed question the guardrail refuses", async () => {
    const generator = async (): Promise<PrepOutput> => ({
      prepCode: "clean()",
      fixes: ["Tidied the file."],
      questions: [
        "Why did sales drop in the West?",
        "What is the total Sales?",
      ],
    });

    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor: successfulExecutor(),
      generator,
    });

    expect(report.questions).toEqual(["What is the total Sales?"]);
  });

  it("fails open without leaking executor errors when cleaning fails", async () => {
    const executor: CodeExecutor = {
      async execute() {
        return execution({
          exitCode: 1,
          stderr: "Traceback: pandas dtype exploded",
        });
      },
    };

    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor,
    });

    expect(report).toEqual({
      ok: false,
      analysisPath: SANDBOX_CSV_PATH,
      fixes: [],
      questions: [],
      counts: null,
      detail:
        "Vera could not tidy this file, so she is working from it as it came.",
    });
    expect(report.detail).not.toMatch(/traceback|pandas|dtype/i);
  });

  it("keeps cleaning successful when the audit output is unreadable", async () => {
    let call = 0;
    const progress: PrepProgressEvent[] = [];
    const executor: CodeExecutor = {
      async execute() {
        call++;
        return call === 1
          ? execution()
          : execution({ stdout: "not an audit" });
      },
    };

    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor,
      onProgress: (event) => progress.push(event),
    });

    expect(report.ok).toBe(true);
    expect(report.analysisPath).toBe(cleanPathFor(DATASET));
    expect(report.counts).toBeNull();
    expect(progress.map(({ stage, status }) => [stage, status])).toEqual([
      ["cleaning", "active"],
      ["cleaning", "complete"],
      ["checking", "active"],
      ["checking", "failed"],
    ]);
  });

  it("does not claim duplicate removal when the audit could not measure it", async () => {
    let call = 0;
    const report = await prepareDataset(DATASET, {
      mockMode: true,
      generator: async () => ({
        prepCode: "clean()",
        fixes: [
          "Exact duplicate records will be removed.",
          "Missing values will be left empty rather than guessed.",
        ],
        questions: ["What is the total Sales?"],
      }),
      executor: {
        async execute() {
          call++;
          return call === 1
            ? execution()
            : execution({ stdout: "VERA_AUDIT_UNAVAILABLE" });
        },
      },
    });

    expect(report.counts).toBeNull();
    expect(report.fixes).toEqual([
      "Missing values will be left empty rather than guessed.",
    ]);
  });

  it("skips the external loader and uses a zero-key stub in mock mode", async () => {
    let loadCalls = 0;

    const report = await prepareDataset(DATASET, {
      mockMode: true,
      loader: async () => {
        loadCalls++;
        throw new Error("the live loader must not run");
      },
    });

    expect(loadCalls).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({
      rowsBefore: 6,
      rowsAfter: 6,
      duplicatesDropped: 0,
      cellsCoerced: 0,
    });
  });

  it("fails open when loading or generation throws", async () => {
    const loadFailure = await prepareDataset(DATASET, {
      mockMode: false,
      loader: async () => {
        throw new Error("Daytona traceback");
      },
      executor: successfulExecutor(),
    });
    const generationFailure = await prepareDataset(DATASET, {
      mockMode: true,
      generator: async () => {
        throw new Error("Fireworks pandas dtype");
      },
      executor: successfulExecutor(),
    });

    for (const report of [loadFailure, generationFailure]) {
      expect(report.ok).toBe(false);
      expect(report.analysisPath).toBe(SANDBOX_CSV_PATH);
      expect(report.counts).toBeNull();
      expect(report.detail).toBe(
        "Vera could not tidy this file, so she is working from it as it came.",
      );
    }
  });

  it("uses a content-aware loader key for sequential uploads", async () => {
    const loadedIds: string[] = [];
    const generator = async (): Promise<PrepOutput> => ({
      prepCode: "clean()",
      fixes: ["Tidied the file."],
      questions: ["What is the total Sales?"],
    });
    const executor: CodeExecutor = {
      async execute(request) {
        return request.code.includes("VERA_AUDIT:")
          ? execution({
              stdout:
                'VERA_AUDIT:{"rowsBefore":6,"rowsAfter":6,"duplicatesDropped":0,"cellsCoerced":0}',
            })
          : execution();
      },
    };
    const secondUpload: ResolvedDataset = {
      ...DATASET,
      content: DATASET.content.replace("West,10", "West,11"),
    };
    const loader = async (datasetId: string) => {
      loadedIds.push(datasetId);
    };

    await prepareDataset(DATASET, {
      mockMode: false,
      loader,
      executor,
      generator,
    });
    await prepareDataset(secondUpload, {
      mockMode: false,
      loader,
      executor,
      generator,
    });

    expect(loadedIds).toEqual([
      `${DATASET.id}:${contentHash(DATASET.content)}`,
      `${secondUpload.id}:${contentHash(secondUpload.content)}`,
    ]);
  });

  it("uses a content-addressed clean artifact for each dataset", async () => {
    const generatedCleanPaths: string[] = [];
    const auditPrograms: string[] = [];
    const generator = async (request: PrepRequest): Promise<PrepOutput> => {
      generatedCleanPaths.push(request.cleanPath);
      return {
        prepCode: "clean()",
        fixes: ["Tidied the file."],
        questions: ["What is the total Sales?"],
      };
    };
    const executor: CodeExecutor = {
      async execute(request) {
        if (request.code.includes("VERA_AUDIT:")) {
          auditPrograms.push(request.code);
          return execution({
            stdout:
              'VERA_AUDIT:{"rowsBefore":6,"rowsAfter":6,"duplicatesDropped":0,"cellsCoerced":0}',
          });
        }
        return execution();
      },
    };
    const secondDataset: ResolvedDataset = {
      ...DATASET,
      content: DATASET.content.replace("West,10", "West,99"),
    };

    const firstReport = await prepareDataset(DATASET, {
      mockMode: true,
      executor,
      generator,
    });
    const secondReport = await prepareDataset(secondDataset, {
      mockMode: true,
      executor,
      generator,
    });

    expect(generatedCleanPaths[0]).not.toBe(generatedCleanPaths[1]);
    expect(firstReport.analysisPath).toBe(generatedCleanPaths[0]);
    expect(secondReport.analysisPath).toBe(generatedCleanPaths[1]);
    expect(auditPrograms[0]).toContain(generatedCleanPaths[0]);
    expect(auditPrograms[1]).toContain(generatedCleanPaths[1]);
  });

  it("runs each real shared-sandbox preparation as one exclusive sequence", async () => {
    const events: string[] = [];
    let loadedId = "";
    const first = {
      ...DATASET,
      id: "upload",
      filename: "first.csv",
      content: DATASET.content.replace("West,10", "West,101"),
      profile: { ...DATASET.profile, filename: "first.csv" },
    };
    const second = {
      ...DATASET,
      id: "upload",
      filename: "second.csv",
      content: DATASET.content.replace("West,10", "West,202"),
      profile: { ...DATASET.profile, filename: "second.csv" },
    };
    const loader = async (datasetId: string) => {
      loadedId = datasetId;
      events.push(`load:${datasetId}`);
    };
    const generator = async (request: PrepRequest): Promise<PrepOutput> => {
      events.push(`generate:${request.profile.filename}`);
      return {
        prepCode: `clean:${request.profile.filename}`,
        fixes: ["Tidied the file."],
        questions: ["What is the total Sales?"],
      };
    };
    const executor: CodeExecutor = {
      async execute(request) {
        const stage = request.code.includes("VERA_AUDIT:")
          ? "audit"
          : request.code;
        events.push(`${stage}:${loadedId}`);
        await Promise.resolve();
        return stage === "audit"
          ? execution({
              stdout:
                'VERA_AUDIT:{"rowsBefore":6,"rowsAfter":6,"duplicatesDropped":0,"cellsCoerced":0}',
            })
          : execution();
      },
    };

    await Promise.all([
      prepareDataset(first, {
        mockMode: false,
        loader,
        executor,
        generator,
      }),
      prepareDataset(second, {
        mockMode: false,
        loader,
        executor,
        generator,
      }),
    ]);

    const firstKey = `${first.id}:${contentHash(first.content)}`;
    const secondKey = `${second.id}:${contentHash(second.content)}`;
    expect(events).toEqual([
      `load:${firstKey}`,
      `generate:${first.filename}`,
      `clean:${first.filename}:${firstKey}`,
      `audit:${firstKey}`,
      `load:${secondKey}`,
      `generate:${second.filename}`,
      `clean:${second.filename}:${secondKey}`,
      `audit:${secondKey}`,
    ]);
  });
});

describe("the prep report store", () => {
  it("invalidates a prepared path when the sandbox identity changes", async () => {
    const hash = contentHash(DATASET.content);
    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor: successfulExecutor(),
    });
    setPrep(hash, report);
    expect(getPrep(hash)).toBe(report);

    await teardownSandbox();

    expect(getPrep(hash)).toBeUndefined();
  });

  it("evicts the oldest report after eight entries", () => {
    const report = {
      ok: true,
      analysisPath: CLEAN_CSV_PATH,
      fixes: [],
      questions: [],
      counts: null,
    };

    for (let index = 0; index < 9; index++) {
      setPrep(`eviction-${index}`, report);
    }

    expect(getPrep("eviction-0")).toBeUndefined();
    expect(getPrep("eviction-1")).toBe(report);
    expect(getPrep("eviction-8")).toBe(report);
  });
});

/**
 * The client half of prep. This suite has no DOM, so the hook runs against a
 * stand-in for React's dispatcher: one state cell, one ref cell, and
 * `useCallback` as identity. That is the entire React surface `usePrepare`
 * touches, and the defects below are entirely about which of its own setState
 * calls are allowed to land once a second file has been chosen.
 */
const reactStub = vi.hoisted(() => {
  let cell: unknown;
  let seeded = false;
  const refs: { current: unknown }[] = [];
  let cursor = 0;

  return {
    reset(): void {
      cell = undefined;
      seeded = false;
      refs.length = 0;
      cursor = 0;
    },
    useState(initial: unknown): [unknown, (next: unknown) => void] {
      if (!seeded) {
        cell = initial;
        seeded = true;
      }
      return [
        cell,
        (next: unknown) => {
          cell =
            typeof next === "function"
              ? (next as (previous: unknown) => unknown)(cell)
              : next;
        },
      ];
    },
    useRef(initial: unknown): { current: unknown } {
      const index = cursor;
      cursor++;
      const existing = refs[index];
      if (existing) return existing;
      const created = { current: initial };
      refs[index] = created;
      return created;
    },
    state(): unknown {
      return cell;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: reactStub.useState,
    useRef: reactStub.useRef,
    useCallback: (callback: unknown) => callback,
  };
});

class StubFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText(file: unknown): void {
    this.result = (file as { content: string }).content;
    queueMicrotask(() => this.onload?.());
  }
}

function stubFile(name: string, content: string): File {
  return { name, size: content.length, content } as unknown as File;
}

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: Record<string, unknown>,
): void {
  controller.enqueue(
    new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
  );
}

/** Lets every queued microtask and the stream reader settle. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 4; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function stubPrepRoute(): {
  signals: AbortSignal[];
  streams: ReadableStreamDefaultController<Uint8Array>[];
} {
  const signals: AbortSignal[] = [];
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];

  reactStub.reset();
  vi.stubGlobal("FileReader", StubFileReader);
  vi.stubGlobal(
    "fetch",
    async (_input: unknown, init?: { signal?: AbortSignal }) => {
      if (init?.signal) signals.push(init.signal);
      return {
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            streams.push(controller);
          },
        }),
      };
    },
  );

  return { signals, streams };
}

describe("usePrepare", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /*
   * Macroscope on PR #41. The validation failure returned before aborting, so
   * the prep already in flight kept streaming: its `prep-report` landed on top
   * of the rejection and installed the file the reader had just replaced as the
   * active dataset — an answer about the wrong file, with an error on screen.
   */
  it("abandons the prep in flight when the next file is rejected", async () => {
    const { signals, streams } = stubPrepRoute();
    const { prepare } = usePrepare();

    void prepare(stubFile("sales.csv", "Region,Sales\nWest,10\n"));
    await settle();
    sendEvent(streams[0] as ReadableStreamDefaultController<Uint8Array>, {
      type: "prep-stage",
      stage: "cleaning",
      status: "active",
      detail: "Tidying only the issues the data can prove.",
    });
    await settle();
    expect((reactStub.state() as PrepState).isPreparing).toBe(true);

    await prepare(stubFile("notes.txt", "not a csv"));

    expect(signals[0]?.aborted).toBe(true);
    expect((reactStub.state() as PrepState).error).toMatch(/csv/i);

    // The events already parsed out of a delivered chunk still arrive.
    sendEvent(streams[0] as ReadableStreamDefaultController<Uint8Array>, {
      type: "prep-report",
      summary: { filename: "sales.csv" },
      report: { ok: true },
    });
    await settle();

    const state = reactStub.state() as PrepState;
    expect(state.summary).toBeNull();
    expect(state.upload).toBeNull();
    expect(state.filename).toBe("notes.txt");
    expect(state.error).toMatch(/csv/i);
  });

  /*
   * The same report, second defect: the superseded run's `finally` cleared
   * `isPreparing` unconditionally, so the screen went idle while its
   * replacement was still preparing.
   */
  it("does not report idle while a newer file is still preparing", async () => {
    const { streams } = stubPrepRoute();
    const { prepare } = usePrepare();

    void prepare(stubFile("first.csv", "Region,Sales\nWest,10\n"));
    await settle();
    void prepare(stubFile("second.csv", "Region,Sales\nEast,20\n"));
    await settle();
    expect((reactStub.state() as PrepState).filename).toBe("second.csv");

    // The abandoned run's stream ends after the newer one has taken over.
    (streams[0] as ReadableStreamDefaultController<Uint8Array>).close();
    await settle();

    expect((reactStub.state() as PrepState).isPreparing).toBe(true);
  });
});

describe("contentHash", () => {
  it("is deterministic SHA-256 over the content bytes", () => {
    expect(contentHash("Vera")).toBe(contentHash("Vera"));
    expect(contentHash("Vera")).toBe(
      "e4ace1dfe147e67d82295838786749431bd7c608b13932a87847ddebf6e1ea9d",
    );
    expect(contentHash("vera")).not.toBe(contentHash("Vera"));
  });
});
