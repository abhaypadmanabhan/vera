import { z } from "zod";
import { MOCK_MODE } from "../config";
import {
  createFireworksClient,
  type FireworksChatResult,
  type FireworksClient,
} from "../fireworks/client";
import type { DatasetProfile, Valence } from "../types";
import { validatePythonPolicy } from "./python-policy";

export interface CodegenRequest {
  question: string;
  profile: DatasetProfile;
  sampleRows: string[][];
  sandboxPath: string;
  previousFailure?: {
    stderr: string;
    failingCode: string;
  };
  attempt?: number;
  signal?: AbortSignal;
}

export interface CodegenOutput {
  code: string;
  explanation: string;
  /** One sentence a business person would say. No column names, no code terms. */
  headline: string;
  columnsUsed: string[];
  /** Declared before execution. Empty is legal and common. */
  context: Array<{
    name: string;
    description: string;
    columnsUsed: string[];
  }>;
  valence: Valence;
}

interface GenerateDependencies {
  mockMode?: boolean;
  client?: FireworksClient;
}

const CODEGEN_JSON_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string", minLength: 1 },
    explanation: { type: "string", minLength: 1 },
    headline: { type: "string", minLength: 1 },
    columnsUsed: {
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
    },
    context: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          columnsUsed: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "columnsUsed"],
        additionalProperties: false,
      },
    },
    valence: { type: "string", enum: ["good", "bad", "neutral"] },
  },
  required: ["code", "explanation", "headline", "columnsUsed"],
  additionalProperties: false,
} satisfies Record<string, unknown>;

const codegenSchema = z
  .object({
    code: z.string().min(1).max(16_000),
    explanation: z.string().min(1).max(1_000),
    headline: z.string().min(1).max(240),
    columnsUsed: z.array(z.string().max(200)).max(200).refine(
      (columns) => new Set(columns).size === columns.length,
      "columnsUsed must not contain duplicates",
    ),
    context: z
      .array(
        z.object({
          name: z.string().min(1).max(64),
          description: z.string().min(1).max(160),
          columnsUsed: z.array(z.string().max(200)).max(20),
        }),
      )
      .max(3)
      .default([]),
    valence: z.enum(["good", "bad", "neutral"]).default("neutral"),
  })
  .strict();

const MAX_PROMPT_CHARS = 64_000;

export function buildCodegenPrompt(request: CodegenRequest): string {
  const safeContext = {
    profile: request.profile,
    sampleRows: request.sampleRows.slice(0, 5),
  };
  const retryContext = request.previousFailure
    ? `\nThe previous code failed. Fix this exact code and error:\n${JSON.stringify(
        {
          stderr: request.previousFailure.stderr.slice(-4_000),
          failingCode: request.previousFailure.failingCode,
        },
        null,
        2,
      )}\n`
    : "";

  const prompt = `You write small, deterministic pandas programs for Vera.

Return JSON only, matching this schema exactly:
${JSON.stringify(CODEGEN_JSON_SCHEMA, null, 2)}

Rules:
- Your first statement after the imports MUST be exactly this line, copied character for character:
  df = pd.read_csv(${JSON.stringify(request.sandboxPath)})
  Do not shorten, tidy, or substitute that path — it is the only file you may read, and any other
  path is rejected before the code runs. Read it exactly once.
- Use the exact column names, null counts, kinds, and sample values in the profile.
- Treat every profile note as a hard constraint.
- When touching a date column with a proven dateFormat, call pd.to_datetime with format="<that exact format>".
- When a numeric column can contain currency symbols, percent signs, commas, or blank cells, normalize it with pd.to_numeric(..., errors="coerce") before computing. Let pandas skip blank/NaN values unless the question requires counting them.
- Do not import or use network libraries. Do not access the network, environment, or filesystem except the CSV path above.
- Print exactly one output line: VERA_RESULT:<JSON value>. Use json.dumps so strings are machine-parseable.
- "headline": ONE short sentence stating the answer the way a business analyst would say it out loud to a colleague. Plain English. NEVER mention column names, date formats, pandas, parsing, filtering, or any code concept. Say what it MEANS, not how it was computed.
- The headline MUST contain the literal placeholder {value} exactly where the answer belongs, and MUST NOT contain the figure itself. You have not run the code yet, so any number you write there would be a guess, and a guessed figure is the one thing this system exists to prevent. Good: "Sales in the third quarter of 2018 came to {value} dollars." Bad: "Sales in the third quarter of 2018 came to 143,787 dollars." Bad: "Parsed OrderDate as DD/MM/YYYY, filtered to Q3 2018, and summed Sales."
- The headline states the answer only. The comparison belongs in the context figures, not in this sentence.
- "explanation": the technical one-liner for the code panel. Column names and formats belong HERE, not in the headline.
- The printed JSON value MUST be either the bare figure, or an object of exactly this shape:
  {"value": <the figure>, "context": {"<name>": <figure>, ...}}. Nothing else. Still ONE print.
- "context" is optional and holds at most three EXTRA figures the same program already has the
  data to compute, and which a business person would want alongside the answer: the same measure
  for the previous comparable period, this slice's share of the whole, or the largest single
  contributor. Every context figure must be a bare number or bare string. Compute them, never
  estimate them. If nothing genuinely informative is available, return no context at all.
- One context figure MAY be the change against a comparable — a percentage change or a difference
  against the previous period, the rest of the file, or the rest of the group. If you want that
  change spoken, compute it in the program and print it as its own context entry.
  Never state a change you did not compute: the reader gets the figure your code produced, or none.
- Express a percentage change as a string with the sign already in it, rounded to at most one
  decimal place — "19%", "-4.2%" — and put the direction in the description, not the number.
- The "context" field in the JSON you return declares those same figures in the SAME ORDER, with
  a "description" written the way you would say it out loud — "the same quarter a year earlier",
  never "prior_period" and never a column name.
- Write a change figure's description so the figure reads in front of it, because that is how it
  will be spoken: "higher than the same quarter a year earlier" becomes "That is 19% higher than
  the same quarter a year earlier". Good: "down on the month before". Bad: "the percentage change
  versus prior_period". Bad: "19% higher than last year" — the figure belongs in the value, never
  in the description.
- "valence": "good" if this finding is welcome news for the business, "bad" if it is unwelcome,
  "neutral" otherwise. It selects a tone of voice only. It MUST NOT contain a number, and it MUST
  be exactly one of those three words.
- Do not print debugging text, tables, labels, markdown, or any other line.
- columnsUsed must list every CSV column read by the computation.
- max_tokens is bounded, so keep the program compact.

Dataset context (profile plus at most five rows, never the full CSV):
${JSON.stringify(safeContext, null, 2)}

User question:
${request.question}
${retryContext}`;

  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `Codegen prompt exceeds the ${MAX_PROMPT_CHARS}-character paid-request limit.`,
    );
  }
  return prompt;
}

function assertSafeCode(
  output: CodegenOutput,
  profile: DatasetProfile,
  sandboxPath: string,
): void {
  validatePythonPolicy({
    code: output.code,
    sandboxPath,
    knownColumns: profile.columns.map((column) => column.name),
    columnsUsed: output.columnsUsed,
    provenDateFormats: profile.columns
      .filter(
        (
          column,
        ): column is typeof column & {
          dateFormat: string;
        } => column.kind === "date" && column.dateFormat !== null,
      )
      .map((column) => ({
        column: column.name,
        format: column.dateFormat,
      })),
  });

  const known = new Set(profile.columns.map((column) => column.name));
  for (const figure of output.context) {
    const unknown = figure.columnsUsed.filter((column) => !known.has(column));
    if (unknown.length > 0) {
      throw new Error(
        `Context figure "${figure.name}" claims columns this file does not have: ${unknown.join(", ")}.`,
      );
    }
  }
}

export function parseCodegenResponse(
  raw: string,
  profile: DatasetProfile,
  sandboxPath: string,
): CodegenOutput {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new Error("Fireworks returned invalid JSON.", { cause: error });
  }

  const output = codegenSchema.parse(parsedJson);
  assertSafeCode(output, profile, sandboxPath);
  return output;
}

function mockResponse(request: CodegenRequest): string {
  const dateColumn = request.profile.columns.find(
    (column) => column.kind === "date" && column.dateFormat,
  );
  const numericColumn =
    request.profile.columns.find((column) => column.kind === "number") ??
    request.profile.columns.find((column) => column.kind === "integer");
  const columnsUsed = [dateColumn?.name, numericColumn?.name].filter(
    (column): column is string => Boolean(column),
  );

  const lines = [
    "import json",
    "import pandas as pd",
    "",
    `df = pd.read_csv(${JSON.stringify(request.sandboxPath)})`,
  ];
  if (dateColumn?.dateFormat) {
    lines.push(
      `df[${JSON.stringify(dateColumn.name)}] = pd.to_datetime(df[${JSON.stringify(
        dateColumn.name,
      )}], format=${JSON.stringify(dateColumn.dateFormat)})`,
    );
  }
  if (numericColumn) {
    lines.push(
      `df[${JSON.stringify(numericColumn.name)}] = pd.to_numeric(df[${JSON.stringify(
        numericColumn.name,
      )}].astype(str).str.replace(r"[$,%]", "", regex=True), errors="coerce")`,
    );
  }
  lines.push(
    numericColumn
      ? `result = {"value": round(float(df[${JSON.stringify(numericColumn.name)}].sum()), 2), "context": {"row_count": int(len(df))}}`
      : 'result = {"value": int(len(df)), "context": {}}',
    'print("VERA_RESULT:" + json.dumps(result, separators=(",", ":")))',
  );

  return JSON.stringify({
    code: lines.join("\n"),
    explanation: numericColumn
      ? `Sums ${numericColumn.name} after applying the profiled schema constraints.`
      : "Counts the dataset rows after loading the profiled CSV.",
    headline: numericColumn
      ? `The total ${numericColumn.name.toLowerCase()} across the file is {value}.`
      : "The file holds {value} records.",
    columnsUsed,
    context: numericColumn
      ? [
          {
            name: "row_count",
            description: "the number of records behind it",
            columnsUsed,
          },
        ]
      : [],
    valence: "neutral",
  });
}

export async function generatePandasCode(
  request: CodegenRequest,
  dependencies: GenerateDependencies = {},
): Promise<CodegenOutput> {
  const mockMode = dependencies.mockMode ?? MOCK_MODE;
  if (mockMode) {
    return parseCodegenResponse(
      mockResponse(request),
      request.profile,
      request.sandboxPath,
    );
  }

  const client = dependencies.client ?? createFireworksClient({ mockMode: false });
  const result: FireworksChatResult = await client.createChatCompletion({
    messages: [
      {
        role: "system",
        content:
          "Return only the requested JSON object. Never wrap it in markdown or prose.",
      },
      { role: "user", content: buildCodegenPrompt(request) },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "vera_pandas_codegen",
        schema: CODEGEN_JSON_SCHEMA,
      },
    },
    maxTokens: 2_048,
    signal: request.signal,
  });

  if (result.finishReason === "length") {
    throw new Error(
      "Fireworks truncated the structured response at max_tokens.",
    );
  }
  return parseCodegenResponse(result.content, request.profile, request.sandboxPath);
}
