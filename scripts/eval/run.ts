export type Answer = number | string;
export type Arm = "vera" | "baseline";

export interface EvalQuestion {
  id: string;
  input: string;
  expected: Answer;
  unit?: string;
  difficulty?: string;
  trap?: boolean;
  notes?: string;
}

export interface ArmRun {
  id: string;
  arm: Arm;
  answer: Answer | null;
  score: 0 | 1;
  attempts: number;
  error: string | null;
}

export interface RecordedQuestion {
  id: string;
  input: string;
  expected: Answer;
  veraAnswer: Answer | null;
  baselineAnswer: Answer | null;
  veraScore: 0 | 1;
  baselineScore: 0 | 1;
  veraAttempts: number;
  baselineAttempts: number;
  veraError: string | null;
  baselineError: string | null;
  trap: boolean;
  notes: string | null;
}

export interface RecordedResults {
  generatedAt: string;
  experimentName: string;
  dashboardUrl: string;
  questionCount: number;
  liveCallCount: number;
  scoring: {
    relativeEpsilon: number;
    absoluteFloor: number;
    stringRule: string;
    missingRule: string;
  };
  headline: {
    veraPercent: number;
    baselinePercent: number;
  };
  baselineMisses: string[];
  questions: RecordedQuestion[];
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const normalized = trimmed
    .replace(/[,$£€¥%\s]/g, "")
    .replace(/^\((.*)\)$/, "$1");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

export function normalizeAnswer(
  value: unknown,
  expected: Answer,
): Answer | null {
  if (typeof expected === "number") return numericValue(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function scoreAnswer(
  actual: unknown,
  expected: Answer,
  relativeEpsilon: number,
  absoluteFloor: number,
): 0 | 1 {
  if (typeof expected === "number") {
    const numeric = numericValue(actual);
    if (numeric === null) return 0;
    const tolerance = Math.max(
      absoluteFloor,
      relativeEpsilon * Math.abs(expected),
    );
    return Math.abs(numeric - expected) <= tolerance ? 1 : 0;
  }

  if (typeof actual !== "string") return 0;
  return actual.trim().toLocaleLowerCase() ===
    expected.trim().toLocaleLowerCase()
    ? 1
    : 0;
}

export function parseVeraResult(stdout: string): Answer | null {
  const prefix = "VERA_RESULT:";
  const lines = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix));
  const raw = lines.at(-1)?.slice(prefix.length).trim();
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "number") {
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof parsed === "string") {
      const trimmed = parsed.trim();
      return trimmed ? trimmed : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function pythonSubprocessEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): NodeJS.ProcessEnv {
  const allowed = ["PATH", "LANG", "LC_ALL", "PYTHONIOENCODING"] as const;
  const nodeEnv =
    source.NODE_ENV === "development" ||
    source.NODE_ENV === "test" ||
    source.NODE_ENV === "production"
      ? source.NODE_ENV
      : "production";
  return {
    NODE_ENV: nodeEnv,
    ...Object.fromEntries(
      allowed.flatMap((key) =>
        typeof source[key] === "string" ? [[key, source[key]]] : [],
      ),
    ),
  };
}

function percentage(correct: number, total: number): number {
  return Math.round((correct / total) * 1_000) / 10;
}

export function buildRecordedResults(options: {
  questions: EvalQuestion[];
  runs: ArmRun[];
  dashboardUrl: string;
  callCount: number;
  relativeEpsilon: number;
  absoluteFloor: number;
  experimentName: string;
}): RecordedResults {
  const runByKey = new Map(
    options.runs.map((run) => [`${run.id}:${run.arm}`, run]),
  );
  const questions = options.questions.map<RecordedQuestion>((question) => {
    const vera = runByKey.get(`${question.id}:vera`);
    const baseline = runByKey.get(`${question.id}:baseline`);
    if (!vera || !baseline) {
      throw new Error(`Missing an eval arm for ${question.id}.`);
    }
    return {
      id: question.id,
      input: question.input,
      expected: question.expected,
      veraAnswer: vera.answer,
      baselineAnswer: baseline.answer,
      veraScore: vera.score,
      baselineScore: baseline.score,
      veraAttempts: vera.attempts,
      baselineAttempts: baseline.attempts,
      veraError: vera.error,
      baselineError: baseline.error,
      trap: question.trap ?? false,
      notes: question.notes ?? null,
    };
  });
  const veraCorrect = questions.reduce(
    (total, question) => total + question.veraScore,
    0,
  );
  const baselineCorrect = questions.reduce(
    (total, question) => total + question.baselineScore,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    experimentName: options.experimentName,
    dashboardUrl: options.dashboardUrl,
    questionCount: questions.length,
    liveCallCount: options.callCount,
    scoring: {
      relativeEpsilon: options.relativeEpsilon,
      absoluteFloor: options.absoluteFloor,
      stringRule: "case-insensitive after trimming",
      missingRule: "missing or unparseable answers score 0",
    },
    headline: {
      veraPercent: percentage(veraCorrect, questions.length),
      baselinePercent: percentage(baselineCorrect, questions.length),
    },
    baselineMisses: questions
      .filter((question) => question.baselineScore === 0)
      .map((question) => question.id),
    questions,
  };
}
