import { z } from "zod";
import { MOCK_MODE } from "../config";
import {
  createFireworksClient,
  type FireworksChatResult,
  type FireworksClient,
} from "../fireworks/client";
import type { DatasetProfile } from "../types";
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
- Read the CSV only from ${JSON.stringify(request.sandboxPath)} with pandas.read_csv.
- Use the exact column names, null counts, kinds, and sample values in the profile.
- Treat every profile note as a hard constraint.
- When touching a date column with a proven dateFormat, call pd.to_datetime with format="<that exact format>".
- When a numeric column can contain currency symbols, percent signs, commas, or blank cells, normalize it with pd.to_numeric(..., errors="coerce") before computing. Let pandas skip blank/NaN values unless the question requires counting them.
- Do not import or use network libraries. Do not access the network, environment, or filesystem except the CSV path above.
- Print exactly one output line: VERA_RESULT:<JSON value>. Use json.dumps so strings are machine-parseable.
- "headline": ONE short sentence stating the answer the way a business analyst would say it out loud to a colleague. Plain English. NEVER mention column names, date formats, pandas, parsing, filtering, or any code concept. Say what it MEANS, not how it was computed. Good: "Sales in the third quarter of 2018 came to 143,787 dollars." Bad: "Parsed OrderDate as DD/MM/YYYY, filtered to Q3 2018, and summed Sales."
- "explanation": the technical one-liner for the code panel. Column names and formats belong HERE, not in the headline.
- That JSON value MUST be a bare number or a bare string — the single figure that answers the question. Never an object, list, or dict. Do not label it; the label belongs in the explanation field.
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
      ? `result = round(float(df[${JSON.stringify(numericColumn.name)}].sum()), 2)`
      : "result = int(len(df))",
    'print("VERA_RESULT:" + json.dumps(result, separators=(",", ":")))',
  );

  return JSON.stringify({
    code: lines.join("\n"),
    explanation: numericColumn
      ? `Sums ${numericColumn.name} after applying the profiled schema constraints.`
      : "Counts the dataset rows after loading the profiled CSV.",
    headline: numericColumn
      ? `Here is the total ${numericColumn.name.toLowerCase()} across the file.`
      : "Here is how many records the file holds.",
    columnsUsed,
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
