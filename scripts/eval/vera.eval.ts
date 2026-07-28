import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Eval, Reporter } from "braintrust";
import { ExactMatch } from "autoevals";
import { generatePandasCode } from "../../lib/codegen/generate";
import { parseCsv } from "../../lib/csv";
import {
  createFireworksClient,
  FIREWORKS_MODEL_ID,
  type FireworksClient,
} from "../../lib/fireworks/client";
import { profileDataset } from "../../lib/profile/profiler";
import type { DatasetProfile } from "../../lib/types";
import {
  buildRecordedResults,
  normalizeAnswer,
  parseVeraResult,
  pythonSubprocessEnvironment,
  scoreAnswer,
  type Answer,
  type Arm,
  type ArmRun,
  type EvalQuestion,
} from "./run";

interface QuestionsPayload {
  dataset: string;
  scoring: {
    relative_epsilon: number;
    absolute_floor: number;
  };
  questions: EvalQuestion[];
}

interface EvalInput {
  id: string;
  arm: Arm;
  question: string;
}

interface EvalMetadata {
  [key: string]: unknown;
  id: string;
  arm: Arm;
  trap: boolean;
  difficulty: string;
  unit: string;
}

interface EvalOutput {
  answer: Answer | null;
  attempts: number;
  error: string | null;
  code: string | null;
  explanation: string | null;
  columnsUsed: string[];
}

interface ExpectedAnswer {
  value: Answer;
}

interface LocalExecution {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const ROOT = process.cwd();
const QUESTIONS_PATH = path.join(ROOT, "eval", "questions.json");
const RESULTS_PATH = path.join(ROOT, "eval", "results.json");
const MAX_LIVE_CALLS = 84;
const MAX_ATTEMPTS_PER_ARM = 2;
const PRIOR_LIVE_CALLS = Number(process.env.VERA_PRIOR_LIVE_CALLS ?? "0");
const PROJECT_NAME = "Vera Accuracy Benchmark";
const EXPERIMENT_NAME = `vera-vs-baseline-${new Date()
  .toISOString()
  .replace(/[:.]/g, "-")}`;

const questionsPayload = JSON.parse(
  readFileSync(QUESTIONS_PATH, "utf8"),
) as QuestionsPayload;
const csvPath = path.join(ROOT, questionsPayload.dataset);
const csv = readFileSync(csvPath, "utf8");
const profile = profileDataset("superstore", path.basename(csvPath), csv);
const sampleRows = parseCsv(csv).slice(1, 6);
const callCounter = { count: 0 };
const baseClient = createFireworksClient({ mockMode: false, timeoutMs: 90_000 });

const countingClient: FireworksClient = {
  async createChatCompletion(request) {
    if (callCounter.count >= MAX_LIVE_CALLS) {
      throw new Error(
        `Refusing Fireworks call beyond hard limit ${MAX_LIVE_CALLS}.`,
      );
    }
    callCounter.count += 1;
    console.log(
      `[Fireworks ${callCounter.count}/${MAX_LIVE_CALLS}] starting request`,
    );
    return baseClient.createChatCompletion(request);
  },
};

function baselinePrompt(
  question: string,
  datasetProfile: DatasetProfile,
  rows: string[][],
): string {
  const context = {
    profile: datasetProfile,
    sampleRows: rows.slice(0, 5),
  };
  return `Answer one question about a CSV from reading the supplied context alone.

Return JSON only, matching this schema exactly:
{"answer":"a plain decimal number or category label"}

Rules:
- You receive the same schema profile and five sample rows as Vera's code-writing arm.
- Do not write or execute code. Do not use tools. Do not claim you inspected the full CSV.
- For numeric answers, return only the decimal digits (and a leading minus sign if needed).
- For categorical answers, return only the category or region name.
- If the context does not contain enough information, make your best estimate from reading alone.

Dataset context (profile plus five rows, never the full CSV):
${JSON.stringify(context, null, 2)}

User question:
${question}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runBaseline(
  question: EvalQuestion,
): Promise<EvalOutput> {
  let lastError = "Baseline returned no answer.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ARM; attempt += 1) {
    try {
      const response = await countingClient.createChatCompletion({
        // The benchmark runs against `data/superstore.csv`, which is committed
        // to this repo. It is our data, so it is the one caller allowed to ask
        // for raw payload tracing — and it still only happens if the operator
        // has also set VERA_TRACE_PAYLOADS=1.
        tracePayloads: true,
        messages: [
          {
            role: "system",
            content:
              "Answer from the provided profile and samples only. Return only the requested JSON object.",
          },
          {
            role: "user",
            content: baselinePrompt(question.input, profile, sampleRows),
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "baseline_answer",
            schema: {
              type: "object",
              properties: {
                answer: { type: "string", minLength: 1 },
              },
              required: ["answer"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 2_048,
      });
      if (response.finishReason === "length") {
        throw new Error("Fireworks truncated the baseline response.");
      }
      const parsed = JSON.parse(response.content) as { answer?: unknown };
      const answer = normalizeAnswer(parsed.answer, question.expected);
      if (answer === null) {
        lastError = "Baseline answer was missing or unparseable.";
        continue;
      }
      return {
        answer,
        attempts: attempt,
        error: null,
        code: null,
        explanation: "Answered from the shared profile and sample rows without execution.",
        columnsUsed: [],
      };
    } catch (error) {
      lastError = errorMessage(error);
    }
  }

  return {
    answer: null,
    attempts: MAX_ATTEMPTS_PER_ARM,
    error: lastError,
    code: null,
    explanation: null,
    columnsUsed: [],
  };
}

function executePython(code: string): Promise<LocalExecution> {
  return new Promise((resolve) => {
    execFile(
      "python3",
      ["-c", code],
      {
        cwd: ROOT,
        env: pythonSubprocessEnvironment(process.env),
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode:
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "number"
              ? error.code
              : error
                ? 1
                : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

async function runVera(question: EvalQuestion): Promise<EvalOutput> {
  let previousFailure:
    | { stderr: string; failingCode: string }
    | undefined;
  let lastError = "Vera returned no answer.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ARM; attempt += 1) {
    try {
      const generated = await generatePandasCode(
        {
          question: question.input,
          profile,
          sampleRows,
          sandboxPath: csvPath,
          previousFailure,
          attempt,
        },
        { mockMode: false, client: countingClient },
      );
      const execution = await executePython(generated.code);
      const answer =
        execution.exitCode === 0
          ? normalizeAnswer(
              parseVeraResult(execution.stdout),
              question.expected,
            )
          : null;

      if (answer !== null) {
        return {
          answer,
          attempts: attempt,
          error: null,
          code: generated.code,
          explanation: generated.explanation,
          columnsUsed: generated.columnsUsed,
        };
      }

      lastError =
        execution.exitCode === 0
          ? "Python produced no parseable VERA_RESULT scalar."
          : execution.stderr.trim() || `Python exited ${execution.exitCode}.`;
      previousFailure = {
        stderr: lastError,
        failingCode: generated.code,
      };
    } catch (error) {
      lastError = errorMessage(error);
    }
  }

  return {
    answer: null,
    attempts: MAX_ATTEMPTS_PER_ARM,
    error: lastError,
    code: previousFailure?.failingCode ?? null,
    explanation: null,
    columnsUsed: [],
  };
}

const evalCases = questionsPayload.questions.flatMap((question) =>
  (["vera", "baseline"] as const).map((arm) => ({
    input: {
      id: question.id,
      arm,
      question: question.input,
    },
    expected: { value: question.expected },
    metadata: {
      id: question.id,
      arm,
      trap: question.trap ?? false,
      difficulty: question.difficulty ?? "unknown",
      unit: question.unit ?? "unknown",
    },
  })),
);

const resultsReporter = Reporter("vera-results", {
  async reportEval(_evaluator, result) {
    const dashboardUrl = result.summary.experimentUrl;
    if (!dashboardUrl) {
      throw new Error("Braintrust did not return an experiment dashboard URL.");
    }

    const runs: ArmRun[] = result.results.map((item) => {
      const input = item.input as EvalInput;
      const output = item.output as EvalOutput;
      const scoreName =
        input.arm === "vera" ? "vera_accuracy" : "baseline_accuracy";
      return {
        id: input.id,
        arm: input.arm,
        answer: output.answer,
        score: item.scores[scoreName] === 1 ? 1 : 0,
        attempts: output.attempts,
        error: output.error,
      };
    });
    const recorded = buildRecordedResults({
      questions: questionsPayload.questions,
      runs,
      dashboardUrl,
      callCount: PRIOR_LIVE_CALLS + callCounter.count,
      relativeEpsilon: questionsPayload.scoring.relative_epsilon,
      absoluteFloor: questionsPayload.scoring.absolute_floor,
      experimentName: result.summary.experimentName,
    });

    await writeFile(RESULTS_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
    console.log(
      `\nHEADLINE: Vera ${recorded.headline.veraPercent}% vs baseline ${recorded.headline.baselinePercent}%`,
    );
    console.log(`DASHBOARD: ${dashboardUrl}`);
    console.log(`LIVE CALLS: ${recorded.liveCallCount}`);
    console.log(
      `BASELINE MISSES: ${recorded.baselineMisses.join(", ") || "none"}`,
    );
    return true;
  },
  reportRun(reports) {
    return reports.every(Boolean);
  },
});

Eval<EvalInput, EvalOutput, ExpectedAnswer, EvalMetadata>(
  PROJECT_NAME,
  {
    experimentName: EXPERIMENT_NAME,
    description:
      "Same GLM 5.2 profile/sample context in both arms; Vera executes generated pandas locally, baseline cannot execute.",
    data: evalCases,
    task: async (input) => {
      const question = questionsPayload.questions.find(
        (candidate) => candidate.id === input.id,
      );
      if (!question) {
        return {
          answer: null,
          attempts: 0,
          error: `Unknown question ${input.id}.`,
          code: null,
          explanation: null,
          columnsUsed: [],
        };
      }
      return input.arm === "vera"
        ? runVera(question)
        : runBaseline(question);
    },
    scores: [
      async ({ input, output, expected }) => {
        const binaryScore = scoreAnswer(
          output.answer,
          expected.value,
          questionsPayload.scoring.relative_epsilon,
          questionsPayload.scoring.absolute_floor,
        );
        const exact = await ExactMatch({
          output: binaryScore,
          expected: 1,
        });
        return {
          name:
            input.arm === "vera" ? "vera_accuracy" : "baseline_accuracy",
          score: exact.score,
        };
      },
    ],
    metadata: {
      model: FIREWORKS_MODEL_ID,
      question_count: questionsPayload.questions.length,
      arms: ["vera", "baseline"],
      shared_context: "schema profile plus the same five sample rows",
      execution: "Vera local python3; baseline none",
    },
    maxConcurrency: 3,
    isPublic: true,
  },
  resultsReporter,
);
