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

export const PREP_FIXES = [
  "Dates with a proven order will be made consistent.",
  "Symbols and separators around amounts will be removed.",
  "Extra spaces around text will be removed.",
  "Exact duplicate records will be removed.",
  "Missing values will be left empty rather than guessed.",
  "Unusual records will be kept rather than removed.",
  "Only exact repeats will be eligible for removal.",
] as const;

type PrepFix = (typeof PREP_FIXES)[number];

const PREP_JSON_SCHEMA = {
  type: "object",
  properties: {
    prepCode: { type: "string", minLength: 1, maxLength: 16_000 },
    fixes: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string", enum: PREP_FIXES },
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
    fixes: z.array(z.enum(PREP_FIXES)).min(1).max(20),
    questions: z.array(z.string().min(1).max(72)).min(1).max(5),
  })
  .strict();

const MAX_PROMPT_CHARS = 64_000;

interface PythonToken {
  kind: "identifier" | "string" | "punct";
  value: string;
}

const PREP_POLICY_ERROR =
  "Prep code contains a statement that is not allowed: use only exact read_csv and clean to_csv path calls with index=False and no aliases.";

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
- Fix only what is defensibly wrong: parse dates with the proven format, strip currency symbols, percent signs, and thousands separators from numeric columns, coerce numeric columns with errors="coerce", and trim whitespace.
- Do NOT drop duplicates in prepCode. Vera's fixed checker measures and removes exact duplicates after your row-preserving cleanup.
- NEVER fill, impute, interpolate or invent a value. NEVER drop a row for being an outlier. Removing real data or inventing missing data would make every later figure a lie.
- Do not import or use network libraries. No environment or filesystem access beyond the two paths above.

Rules for "fixes":
- Choose exact sentences only from this list: ${JSON.stringify(PREP_FIXES)}.
- Include only sentences supported by this profile. Date, symbol, spacing, and duplicate sentences require matching evidence.
- The three safeguard sentences about missing values, unusual records, and exact repeats are always applicable, so return at least one fix.

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

function splitStatements(tokens: PythonToken[]): PythonToken[][] {
  const statements: PythonToken[][] = [];
  let statement: PythonToken[] = [];
  let depth = 0;

  for (const token of tokens) {
    if (token.value === ";") {
      throw new Error(PREP_POLICY_ERROR);
    }
    if (token.value === "(" || token.value === "[") depth++;
    if (token.value === ")" || token.value === "]") depth--;
    if (depth < 0) {
      throw new Error("Prep code has unbalanced syntax.");
    }
    if (token.value === "\n") {
      if (depth === 0 && statement.length > 0) {
        statements.push(statement);
        statement = [];
      }
      continue;
    }
    statement.push(token);
  }
  if (depth !== 0) throw new Error("Prep code has unbalanced syntax.");
  if (statement.length > 0) statements.push(statement);
  return statements;
}

function sameTokens(left: PythonToken[], rightCode: string): boolean {
  const right = tokenizePython(rightCode).filter(
    (token) => token.value !== "\n",
  );
  return (
    left.length === right.length &&
    left.every(
      (token, index) =>
        token.kind === right[index]?.kind &&
        token.value === right[index]?.value,
    )
  );
}

function transformFor(
  column: DatasetProfile["columns"][number],
): string | null {
  const name = JSON.stringify(column.name);
  if (
    column.kind === "date" &&
    column.dateFormat &&
    (column.evidence?.supportingRows ?? 0) > 0 &&
    column.evidence?.contradictingRows === 0
  ) {
    return `df[${name}] = pd.to_datetime(df[${name}], format=${JSON.stringify(column.dateFormat)})`;
  }
  if (column.kind === "number" || column.kind === "integer") {
    return `df[${name}] = pd.to_numeric(df[${name}].astype(str).str.replace(r"[$,%]", "", regex=True), errors="coerce")`;
  }
  if (
    column.kind === "category" ||
    column.kind === "text" ||
    column.kind === "id"
  ) {
    return `df[${name}] = df[${name}].apply(lambda value: value.strip() if isinstance(value, str) else value)`;
  }
  return null;
}

function canonicalizePrepCode(
  code: string,
  request: PrepRequest,
): string {
  const statements = splitStatements(tokenizePython(code));
  const importLine = "import pandas as pd";
  const readLine = `df = pd.read_csv(${JSON.stringify(request.sourcePath)})`;
  const writeLine = `df.to_csv(${JSON.stringify(request.cleanPath)}, index=False)`;
  if (
    statements.length < 3 ||
    !sameTokens(statements[0] ?? [], importLine) ||
    !sameTokens(statements[1] ?? [], readLine) ||
    !sameTokens(statements.at(-1) ?? [], writeLine)
  ) {
    throw new Error(
      PREP_POLICY_ERROR,
    );
  }

  const available = request.profile.columns
    .map(transformFor)
    .filter((line): line is string => line !== null);
  const used = new Set<number>();
  const canonicalTransforms: string[] = [];
  for (const statement of statements.slice(2, -1)) {
    const match = available.findIndex(
      (line, index) => !used.has(index) && sameTokens(statement, line),
    );
    if (match < 0) {
      throw new Error(PREP_POLICY_ERROR);
    }
    used.add(match);
    canonicalTransforms.push(available[match] ?? "");
  }
  return [importLine, readLine, ...canonicalTransforms, writeLine].join("\n");
}

function allowedFixes(profile: DatasetProfile): Set<PrepFix> {
  const allowed = new Set<PrepFix>(PREP_FIXES.slice(4));
  if (profile.duplicateRowCount > 0) allowed.add(PREP_FIXES[3]);
  if (
    profile.columns.some(
      (column) =>
        column.kind === "date" &&
        column.dateFormat &&
        (column.evidence?.supportingRows ?? 0) > 0 &&
        column.evidence?.contradictingRows === 0,
    )
  ) {
    allowed.add(PREP_FIXES[0]);
  }
  if (
    profile.columns.some(
      (column) =>
        (column.kind === "number" || column.kind === "integer") &&
        column.sampleValues.some((value) => /[$%]|\d,\d/.test(value)),
    )
  ) {
    allowed.add(PREP_FIXES[1]);
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
    allowed.add(PREP_FIXES[2]);
  }
  return allowed;
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
  const applicable = allowedFixes(request.profile);
  if (output.fixes.some((fix) => !applicable.has(fix))) {
    throw new Error(
      "A proposed fix is not supported by this dataset profile.",
    );
  }
  return {
    ...output,
    prepCode: canonicalizePrepCode(output.prepCode, request),
  };
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
  const applicable = allowedFixes(profile);
  return PREP_FIXES.filter((fix) => applicable.has(fix)).slice(0, 3);
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

  lines.push(`df.to_csv(${pythonString(request.cleanPath)}, index=False)`);

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
