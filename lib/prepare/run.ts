import type { CodeExecutor } from "../codegen/retry";
import { LIMITS, MOCK_MODE } from "../config";
import { parseCsv } from "../csv";
import { contentHash } from "../datasets";
import { profileDataset } from "../profile/profiler";
import {
  CLEAN_CSV_PATH,
  SANDBOX_CSV_PATH,
  daytonaExecutor,
  ensureDatasetLoaded,
  readSandboxFile,
} from "../daytona/sandbox";
import { classifyQuestion } from "../guardrails/classify";
import type {
  DatasetProfile,
  ExecutionResult,
  ResolvedDataset,
} from "../types";
import {
  buildAuditProgram,
  parseAuditOutput,
  type AuditCounts,
} from "./audit";
import {
  generatePrep,
  PREP_FIXES,
  type PrepOutput,
  type PrepRequest,
} from "./generate";

const FAILURE_DETAIL =
  "Vera could not tidy this file, so she is working from it as it came.";

export interface PrepReport {
  ok: boolean;
  analysisPath: string;
  /** Deterministic profile of the exact artifact at analysisPath. */
  analysisProfile?: DatasetProfile;
  fixes: string[];
  questions: string[];
  counts: AuditCounts | null;
  detail?: string;
}

type PrepGenerator = (
  request: PrepRequest,
  dependencies: { mockMode: boolean },
) => Promise<PrepOutput>;

type DatasetLoader = (
  datasetId: string,
  content: string,
) => Promise<unknown>;

type PreparedFileReader = (path: string) => Promise<string>;

export interface PrepProgressEvent {
  stage: "cleaning" | "checking";
  status: "active" | "complete" | "failed";
  detail: string;
}

interface PrepareDependencies {
  executor?: CodeExecutor;
  mockMode?: boolean;
  generator?: PrepGenerator;
  loader?: DatasetLoader;
  reader?: PreparedFileReader;
  onProgress?: (event: PrepProgressEvent) => void;
}

let livePrepTail = Promise.resolve();

async function withLivePrepLock<T>(run: () => Promise<T>): Promise<T> {
  const previous = livePrepTail;
  let release = () => {};
  livePrepTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await run();
  } finally {
    release();
  }
}

function failOpen(): PrepReport {
  return {
    ok: false,
    analysisPath: SANDBOX_CSV_PATH,
    fixes: [],
    questions: [],
    counts: null,
    detail: FAILURE_DETAIL,
  };
}

function mockExecution(stdout = ""): ExecutionResult {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
    value: null,
    // Prep computes no figure of its own — the counts come from the audit.
    contextValues: {},
    durationMs: 0,
  };
}

function createMockExecutor(dataset: ResolvedDataset): CodeExecutor {
  return {
    async execute({ code }) {
      if (code.includes("VERA_AUDIT:")) {
        const rowsBefore = dataset.profile.rowCount;
        const duplicatesDropped = dataset.profile.duplicateRowCount;
        return mockExecution(
          `VERA_AUDIT:${JSON.stringify({
            rowsBefore,
            rowsAfter: rowsBefore - duplicatesDropped,
            duplicatesDropped,
            cellsCoerced: 0,
          })}`,
        );
      }
      return mockExecution();
    },
  };
}

function execute(
  executor: CodeExecutor,
  code: string,
): Promise<ExecutionResult> {
  return executor.execute({
    code,
    csvPath: SANDBOX_CSV_PATH,
    timeoutMs: LIMITS.runBudgetMs,
    signal: new AbortController().signal,
  });
}

function cleanPathFor(content: string): string {
  return CLEAN_CSV_PATH.replace(
    /\.csv$/,
    `-${contentHash(content)}.csv`,
  );
}

export async function prepareDataset(
  dataset: ResolvedDataset,
  dependencies: PrepareDependencies = {},
): Promise<PrepReport> {
  const mockMode = dependencies.mockMode ?? MOCK_MODE;
  const generator = dependencies.generator ?? generatePrep;
  const loader = dependencies.loader ?? ensureDatasetLoaded;
  const reader =
    dependencies.reader ??
    (mockMode
      ? async () => dataset.content
      : readSandboxFile);
  const executor =
    dependencies.executor ??
    (mockMode
      ? createMockExecutor(dataset)
      : daytonaExecutor);
  const cleanPath = cleanPathFor(dataset.content);
  let activeStage: PrepProgressEvent["stage"] | null = null;

  const notify = (event: PrepProgressEvent): void => {
    try {
      dependencies.onProgress?.(event);
    } catch {
      // Progress delivery is observational and must never change prep results.
    }
  };
  const startStage = (
    stage: PrepProgressEvent["stage"],
    detail: string,
  ): void => {
    activeStage = stage;
    notify({ stage, status: "active", detail });
  };
  const finishStage = (
    stage: PrepProgressEvent["stage"],
    detail: string,
  ): void => {
    notify({ stage, status: "complete", detail });
    activeStage = null;
  };
  const failActiveStage = (): void => {
    if (!activeStage) return;
    notify({
      stage: activeStage,
      status: "failed",
      detail: FAILURE_DETAIL,
    });
    activeStage = null;
  };

  const run = async (): Promise<PrepReport> => {
    startStage(
      "cleaning",
      "Tidying only the issues the data can prove.",
    );
    if (!mockMode) {
      await loader(
        `${dataset.id}:${contentHash(dataset.content)}`,
        dataset.content,
      );
    }

    const rows = parseCsv(dataset.content);
    const generated = await generator(
      {
        profile: dataset.profile,
        sampleRows: rows.slice(1, 6),
        sourcePath: SANDBOX_CSV_PATH,
        cleanPath,
      },
      { mockMode },
    );

    const cleaning = await execute(executor, generated.prepCode);
    if (cleaning.exitCode !== 0) {
      failActiveStage();
      return failOpen();
    }
    finishStage("cleaning", "Prepared the file without inventing values.");

    startStage(
      "checking",
      "Checking the prepared file against the original.",
    );
    let counts: AuditCounts | null = null;
    try {
      const audit = await execute(
        executor,
        buildAuditProgram(SANDBOX_CSV_PATH, cleanPath),
      );
      if (audit.exitCode !== 0) {
        failActiveStage();
      } else {
        counts = parseAuditOutput(audit.stdout);
        if (!counts) {
          failActiveStage();
        }
      }
    } catch {
      failActiveStage();
    }
    let analysisProfile: DatasetProfile;
    try {
      const cleanedContent = await reader(cleanPath);
      analysisProfile = profileDataset(
        dataset.id,
        dataset.filename,
        cleanedContent,
      );
    } catch {
      failActiveStage();
      return failOpen();
    }
    if (activeStage === "checking") {
      finishStage(
        "checking",
        "Checked the prepared file against the original.",
      );
    }
    const questions = generated.questions.filter(
      (question) => classifyQuestion(question, dataset.profile).allowed,
    );

    return {
      ok: true,
      analysisPath: cleanPath,
      analysisProfile,
      fixes: counts
        ? generated.fixes
        : generated.fixes.filter((fix) => fix !== PREP_FIXES[7]),
      questions,
      counts,
    };
  };

  try {
    return mockMode ? await run() : await withLivePrepLock(run);
  } catch {
    failActiveStage();
    return failOpen();
  }
}
