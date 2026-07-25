import { z } from "zod";
import { MOCK_MODE } from "../config";
import {
  createFireworksClient,
  type FireworksChatResult,
  type FireworksClient,
} from "../fireworks/client";
import type { DatasetProfile } from "../types";

export interface PrepRequest {
  profile: DatasetProfile;
  sampleRows: string[][];
  sourcePath: string;
  cleanPath: string;
  signal?: AbortSignal;
}

export interface PrepOutput {
  prepCode: string;
  fixes: string[];
  questions: string[];
}

interface GenerateDependencies {
  mockMode?: boolean;
  client?: FireworksClient;
}

const PREP_JSON_SCHEMA = {
  type: "object",
  properties: {
    prepCode: { type: "string", minLength: 1, maxLength: 16_000 },
    fixes: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 240 },
    },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 72 },
    },
  },
  required: ["prepCode", "fixes", "questions"],
  additionalProperties: false,
} satisfies Record<string, unknown>;

const prepSchema = z
  .object({
    prepCode: z.string().min(1).max(16_000),
    fixes: z.array(z.string().min(1).max(240)).min(1).max(20),
    questions: z.array(z.string().min(1).max(72)).min(1).max(5),
  })
  .strict();

const MAX_PROMPT_CHARS = 64_000;
const FIX_JARGON =
  /\b(pandas|pd\.|dataframe|df\[|to_datetime|to_numeric|dtype|astype|NaN|regex|%[dmY])\b/i;
const FIX_JARGON_BOUNDARY_GAPS = /(?:pd\.|df\[|%[dmY])/i;
const FORBIDDEN_CALLS = new Set([
  "__import__",
  "compile",
  "eval",
  "exec",
  "open",
]);
const PANDAS_IO_METHODS = new Set([
  "read_clipboard",
  "read_csv",
  "read_excel",
  "read_feather",
  "read_fwf",
  "read_gbq",
  "read_hdf",
  "read_html",
  "read_json",
  "read_orc",
  "read_parquet",
  "read_pickle",
  "read_sas",
  "read_spss",
  "read_sql",
  "read_stata",
  "read_table",
  "read_xml",
  "to_clipboard",
  "to_csv",
  "to_excel",
  "to_feather",
  "to_gbq",
  "to_hdf",
  "to_html",
  "to_json",
  "to_orc",
  "to_parquet",
  "to_pickle",
  "to_sql",
  "to_stata",
  "to_xml",
]);

interface PythonToken {
  kind: "identifier" | "string" | "punct";
  value: string;
}

export function buildPrepPrompt(request: PrepRequest): string {
  const safeContext = {
    profile: request.profile,
    sampleRows: request.sampleRows.slice(0, 5),
  };
  const prompt = `You prepare a messy business file for analysis, the way a careful analyst would before they answer any question about it.

Return JSON only, matching this schema exactly:
${JSON.stringify(PREP_JSON_SCHEMA, null, 2)}

Rules for "prepCode":
- Read ONLY from ${JSON.stringify(request.sourcePath)} with pandas.read_csv, and write the cleaned frame to ${JSON.stringify(request.cleanPath)} with df.to_csv(index=False). Touch no other path.
- Fix only what is defensibly wrong: parse dates with the proven format, strip currency symbols, percent signs, and thousands separators from numeric columns, coerce numeric columns with errors="coerce", trim whitespace, and drop exactly-duplicated rows.
- NEVER fill, impute, interpolate or invent a value. NEVER drop a row for being an outlier. Removing real data or inventing missing data would make every later figure a lie.
- Do not import or use network libraries. No environment or filesystem access beyond the two paths above.

Rules for "fixes":
- Write one short plain-English sentence for each intended fix, as if telling a colleague what you tidied.
- NEVER name a column, a date format, a pandas function, or any code concept.
- Good: "Some amounts were stored as text with dollar signs, so they would not have added up."
- Bad: "Applied pd.to_numeric to the Sales column."

Rules for "questions":
- Return five domain-expert opening questions worth asking of THIS file.
- Each question must ask for one computable figure using only these columns.
- No opinion, prediction, or cause questions.
- Use plain English and no more than 72 characters per question.

Dataset context (profile plus at most five rows, never the full CSV):
${JSON.stringify(safeContext, null, 2)}`;

  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `Prep prompt exceeds the ${MAX_PROMPT_CHARS}-character paid-request limit.`,
    );
  }
  return prompt;
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function readEscapedCharacter(
  code: string,
  slashIndex: number,
): { value: string; nextIndex: number } {
  const marker = code[slashIndex + 1] ?? "";
  const hexLengths: Record<string, number> = { x: 2, u: 4, U: 8 };
  const hexLength = hexLengths[marker];
  if (hexLength) {
    const digits = code.slice(slashIndex + 2, slashIndex + 2 + hexLength);
    if (digits.length === hexLength && /^[0-9a-f]+$/i.test(digits)) {
      const point = Number.parseInt(digits, 16);
      if (point <= 0x10ffff) {
        return {
          value: String.fromCodePoint(point),
          nextIndex: slashIndex + 2 + hexLength,
        };
      }
    }
  }
  if (/[0-7]/.test(marker)) {
    const digits = code.slice(slashIndex + 1).match(/^[0-7]{1,3}/)?.[0] ?? "";
    return {
      value: String.fromCodePoint(Number.parseInt(digits, 8)),
      nextIndex: slashIndex + 1 + digits.length,
    };
  }

  const simpleEscapes: Record<string, string> = {
    "\\": "\\",
    "'": "'",
    '"': '"',
    n: "\n",
    r: "\r",
    t: "\t",
  };
  return {
    value: simpleEscapes[marker] ?? marker,
    nextIndex: slashIndex + 2,
  };
}

function tokenizePython(code: string): PythonToken[] {
  const tokens: PythonToken[] = [];
  let index = 0;

  while (index < code.length) {
    const char = code[index] ?? "";
    if (char === "\n" || char === "\r") {
      if (char === "\r" && code[index + 1] === "\n") index++;
      tokens.push({ kind: "punct", value: "\n" });
      index++;
      continue;
    }
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === "#") {
      while (
        index < code.length &&
        code[index] !== "\n" &&
        code[index] !== "\r"
      ) {
        index++;
      }
      continue;
    }
    if (char !== "'" && char !== '"') {
      if (isIdentifierStart(char)) {
        const start = index;
        index++;
        while (index < code.length && isIdentifierPart(code[index] ?? "")) {
          index++;
        }
        tokens.push({
          kind: "identifier",
          value: code.slice(start, index),
        });
        continue;
      }
      tokens.push({ kind: "punct", value: char });
      index++;
      continue;
    }

    const quote = char;
    const triple =
      code[index + 1] === quote && code[index + 2] === quote;
    index += triple ? 3 : 1;
    let value = "";
    while (index < code.length) {
      if (
        triple &&
        code[index] === quote &&
        code[index + 1] === quote &&
        code[index + 2] === quote
      ) {
        index += 3;
        break;
      }
      if (!triple && code[index] === quote) {
        index++;
        break;
      }
      if (code[index] === "\\" && index + 1 < code.length) {
        const escaped = readEscapedCharacter(code, index);
        value += escaped.value;
        index = escaped.nextIndex;
        continue;
      }
      value += code[index] ?? "";
      index++;
    }
    tokens.push({ kind: "string", value });
  }

  return tokens;
}

function findClosingParen(tokens: PythonToken[], opening: number): number {
  let depth = 0;
  for (let index = opening; index < tokens.length; index++) {
    if (tokens[index]?.value === "(") depth++;
    else if (tokens[index]?.value === ")") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findMethodCalls(
  tokens: PythonToken[],
  objectName: string,
  methodName: string,
): PythonToken[][] {
  const calls: PythonToken[][] = [];
  for (let index = 0; index < tokens.length - 3; index++) {
    if (
      tokens[index]?.value !== objectName ||
      tokens[index + 1]?.value !== "." ||
      tokens[index + 2]?.value !== methodName ||
      tokens[index + 3]?.value !== "("
    ) {
      continue;
    }
    const closing = findClosingParen(tokens, index + 3);
    if (closing >= 0) calls.push(tokens.slice(index + 4, closing));
  }
  return calls;
}

function validateResources(
  tokens: PythonToken[],
  request: PrepRequest,
): void {
  const allowedPaths = new Set([request.sourcePath, request.cleanPath]);
  const outsideResource = tokens.find(
    (token) =>
      token.kind === "string" &&
      !allowedPaths.has(token.value) &&
      (token.value.startsWith("/") ||
        /(^|[\\/])\.\.([\\/]|$)/.test(token.value) ||
        /^[a-z][a-z0-9+.-]*:\/\//i.test(token.value) ||
        /^[a-z]:[\\/]/i.test(token.value) ||
        token.value.startsWith("\\\\")),
  );
  if (outsideResource) {
    throw new Error(
      "Prep code must not access a path or resource outside the two CSV files.",
    );
  }
}

function validateImportsAndForbiddenCalls(tokens: PythonToken[]): void {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token?.value === "from") {
      throw new Error("Prep code must not use from-imports.");
    }
    if (token?.value === "import") {
      const line: string[] = [];
      for (let cursor = index + 1; cursor < tokens.length; cursor++) {
        const current = tokens[cursor];
        if (!current || current.value === "\n" || current.value === ";") break;
        line.push(current.value);
      }
      if (line.join(" ") !== "pandas as pd") {
        throw new Error("Prep code may import only pandas as pd.");
      }
    }
    if (
      token?.kind === "identifier" &&
      FORBIDDEN_CALLS.has(token.value)
    ) {
      throw new Error(`Prep code must not call ${token.value}.`);
    }
    if (
      token?.value === "." &&
      tokens[index + 1]?.kind === "identifier" &&
      PANDAS_IO_METHODS.has(tokens[index + 1]?.value ?? "")
    ) {
      const method = tokens[index + 1]?.value;
      if (tokens[index + 2]?.value !== "(") {
        throw new Error(`Prep code must not alias ${method}.`);
      }
      const allowedRead =
        tokens[index - 1]?.value === "pd" && method === "read_csv";
      const allowedWrite =
        tokens[index - 1]?.value === "df" && method === "to_csv";
      if (!allowedRead && !allowedWrite) {
        throw new Error(`Prep code must not call ${method}.`);
      }
    }
  }
}

function validateCsvCalls(tokens: PythonToken[], request: PrepRequest): void {
  const readCalls = findMethodCalls(tokens, "pd", "read_csv").map((call) =>
    call.filter((token) => token.value !== "\n"),
  );
  if (
    readCalls.length !== 1 ||
    readCalls[0]?.length !== 1 ||
    readCalls[0]?.[0]?.kind !== "string" ||
    readCalls[0]?.[0]?.value !== request.sourcePath
  ) {
    throw new Error(
      "Prep code must call pd.read_csv with the exact source path once.",
    );
  }

  const writeCalls = findMethodCalls(tokens, "df", "to_csv").map((call) =>
    call.filter((token) => token.value !== "\n"),
  );
  const write = writeCalls[0];
  if (
    writeCalls.length !== 1 ||
    write?.length !== 5 ||
    write[0]?.kind !== "string" ||
    write[0].value !== request.cleanPath ||
    write[1]?.value !== "," ||
    write[2]?.value !== "index" ||
    write[3]?.value !== "=" ||
    write[4]?.value !== "False"
  ) {
    throw new Error(
      "Prep code must call df.to_csv with the exact clean path and index=False once.",
    );
  }
}

function assertPrepPolicy(output: PrepOutput, request: PrepRequest): void {
  const tokens = tokenizePython(output.prepCode);
  validateResources(tokens, request);
  validateImportsAndForbiddenCalls(tokens);
  validateCsvCalls(tokens, request);

  if (
    output.fixes.some(
      (fix) => FIX_JARGON.test(fix) || FIX_JARGON_BOUNDARY_GAPS.test(fix),
    )
  ) {
    throw new Error("A fix must be written in plain English.");
  }
}

export function parsePrepResponse(
  raw: string,
  request: PrepRequest,
): PrepOutput {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new Error("Fireworks returned invalid JSON.", { cause: error });
  }

  const output = prepSchema.parse(parsedJson);
  assertPrepPolicy(output, request);
  return output;
}

function pythonString(value: string): string {
  return JSON.stringify(value);
}

function boundedQuestion(
  prefix: string,
  column: string,
  suffix = "?",
): string {
  const available = Math.max(1, 72 - prefix.length - suffix.length);
  return `${prefix}${column.slice(0, available)}${suffix}`;
}

function mockQuestions(profile: DatasetProfile): string[] {
  const firstColumn = profile.columns[0]?.name;
  const numericColumn =
    profile.columns.find((column) => column.kind === "number")?.name ??
    profile.columns.find((column) => column.kind === "integer")?.name;
  const categoryColumn =
    profile.columns.find((column) => column.kind === "category")?.name ??
    firstColumn ??
    "";

  if (!numericColumn) {
    if (!firstColumn) {
      return [
        "How many records are in this file?",
        "How many columns are in this file?",
        "How many exact duplicate records are there?",
        "How many records contain a missing value?",
        "How many records have no missing values?",
      ];
    }
    return [
      "How many records are in this file?",
      boundedQuestion("How many distinct ", firstColumn, " values are there?"),
      boundedQuestion("How many ", firstColumn, " values are missing?"),
      boundedQuestion("How many ", firstColumn, " values are present?"),
      "How many exact duplicate records are there?",
    ];
  }

  return [
    boundedQuestion("What is the total ", numericColumn),
    boundedQuestion("What is the average ", numericColumn),
    boundedQuestion("What is the highest ", numericColumn),
    boundedQuestion("How many distinct ", categoryColumn, " values are there?"),
    boundedQuestion("How many ", categoryColumn, " values are missing?"),
  ];
}

function mockFixes(profile: DatasetProfile): string[] {
  const fixes: string[] = [];
  if (profile.duplicateRowCount > 0) {
    fixes.push("Exact duplicate records will be removed.");
  }
  if (
    profile.columns.some(
      (column) =>
        column.kind === "date" &&
        column.dateFormat &&
        (column.evidence?.supportingRows ?? 0) > 0 &&
        column.evidence?.contradictingRows === 0,
    )
  ) {
    fixes.push("Dates with a proven order will be made consistent.");
  }
  if (
    profile.columns.some(
      (column) =>
        (column.kind === "number" || column.kind === "integer") &&
        column.sampleValues.some((value) => /[$%]|\d,\d/.test(value)),
    )
  ) {
    fixes.push("Symbols and separators around amounts will be removed.");
  }
  if (
    profile.columns.some(
      (column) =>
        (column.kind === "category" ||
          column.kind === "text" ||
          column.kind === "id") &&
        column.sampleValues.some((value) => value.trim() !== value),
    )
  ) {
    fixes.push("Extra spaces around text will be removed.");
  }
  fixes.push(
    "Missing values will be left empty rather than guessed.",
    "Unusual records will be kept rather than removed.",
    "Only exact repeats will be eligible for removal.",
  );
  return fixes.slice(0, 3);
}

function mockResponse(request: PrepRequest): string {
  const lines = [
    "import pandas as pd",
    "",
    `df = pd.read_csv(${pythonString(request.sourcePath)})`,
  ];

  for (const column of request.profile.columns) {
    if (column.kind === "date" && column.dateFormat) {
      lines.push(
        `df[${pythonString(column.name)}] = pd.to_datetime(df[${pythonString(
          column.name,
        )}], format=${pythonString(column.dateFormat)})`,
      );
    }
    if (column.kind === "number" || column.kind === "integer") {
      lines.push(
        `df[${pythonString(column.name)}] = pd.to_numeric(df[${pythonString(
          column.name,
        )}].astype(str).str.replace(r"[$,%]", "", regex=True), errors="coerce")`,
      );
    }
    if (
      column.kind === "category" ||
      column.kind === "text" ||
      column.kind === "id"
    ) {
      lines.push(
        `df[${pythonString(column.name)}] = df[${pythonString(
          column.name,
        )}].apply(lambda value: value.strip() if isinstance(value, str) else value)`,
      );
    }
  }

  lines.push(
    "df = df.drop_duplicates()",
    `df.to_csv(${pythonString(request.cleanPath)}, index=False)`,
  );

  return JSON.stringify({
    prepCode: lines.join("\n"),
    fixes: mockFixes(request.profile),
    questions: mockQuestions(request.profile),
  });
}

export async function generatePrep(
  request: PrepRequest,
  dependencies: GenerateDependencies = {},
): Promise<PrepOutput> {
  const mockMode = dependencies.mockMode ?? MOCK_MODE;
  if (mockMode) {
    return parsePrepResponse(mockResponse(request), request);
  }

  const client = dependencies.client ?? createFireworksClient({ mockMode: false });
  const result: FireworksChatResult = await client.createChatCompletion({
    messages: [
      {
        role: "system",
        content:
          "Return only the requested JSON object. Never wrap it in markdown or prose.",
      },
      { role: "user", content: buildPrepPrompt(request) },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "vera_file_prep",
        schema: PREP_JSON_SCHEMA,
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
  return parsePrepResponse(result.content, request);
}
