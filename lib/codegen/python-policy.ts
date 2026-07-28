/**
 * A program the model wrote that this policy will not run.
 *
 * Distinguished from an ordinary failure because it is *correctable*: the
 * message names exactly what is wrong ("must call pd.read_csv with <path>"),
 * which is the same shape as a stderr the retry loop already feeds back. The
 * 2026-07-26 live run lost two findings to a path violation that died at
 * `attempts: 1` — including the follow-up that would have made a multi-finding
 * deck. A genuine upstream failure (network, auth, budget) is NOT this, and
 * must keep failing fast rather than burning another paid call.
 */
export class PolicyViolationError extends Error {
  /** The rejected program, so the retry can show the model its own mistake. */
  readonly code: string;

  constructor(message: string, code = "") {
    super(message);
    this.name = "PolicyViolationError";
    this.code = code;
  }
}

interface PythonToken {
  kind: "identifier" | "string" | "punct";
  value: string;
}

interface PythonPolicyOptions {
  code: string;
  sandboxPath: string;
  knownColumns: string[];
  columnsUsed: string[];
  provenDateFormats: Array<{ column: string; format: string }>;
}

const ALLOWED_IMPORTS = new Set(["json", "pandas"]);
const FORBIDDEN_PANDAS_IO = new Set([
  "read_clipboard",
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
const FORBIDDEN_CALLS = new Set(["__import__", "eval", "exec", "open"]);

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

/**
 * Tokenize only the Python constructs this policy needs. Comments and string
 * contents never become executable identifiers, preventing lexical false
 * positives without pretending to be a full Python parser.
 */
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
    if (char === "'" || char === '"') {
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
          value += code[index + 1] ?? "";
          index += 2;
          continue;
        }
        value += code[index] ?? "";
        index++;
      }
      tokens.push({ kind: "string", value });
      continue;
    }
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
    if (closing < 0) continue;
    calls.push(tokens.slice(index + 4, closing));
  }
  return calls;
}

function findFunctionCalls(
  tokens: PythonToken[],
  functionName: string,
): PythonToken[][] {
  const calls: PythonToken[][] = [];
  for (let index = 0; index < tokens.length - 1; index++) {
    if (
      tokens[index]?.kind !== "identifier" ||
      tokens[index]?.value !== functionName ||
      tokens[index + 1]?.value !== "("
    ) {
      continue;
    }
    const closing = findClosingParen(tokens, index + 1);
    if (closing < 0) continue;
    calls.push(tokens.slice(index + 2, closing));
  }
  return calls;
}

function hasSequence(tokens: PythonToken[], values: string[]): boolean {
  return tokens.some((_token, start) =>
    values.every((value, offset) => tokens[start + offset]?.value === value),
  );
}

function validateImports(tokens: PythonToken[]): void {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token?.value === "from") {
      const moduleName = tokens[index + 1]?.value;
      if (moduleName && !ALLOWED_IMPORTS.has(moduleName)) {
        throw new PolicyViolationError(
          `Generated code must not import network-capable or filesystem module ${moduleName}; only json and pandas are allowed.`,
        );
      }
    }
    if (token?.value !== "import") continue;

    let expectModule = true;
    for (let cursor = index + 1; cursor < tokens.length; cursor++) {
      const current = tokens[cursor];
      if (!current || current.value === "\n" || current.value === ";") break;
      if (current.value === ",") {
        expectModule = true;
        continue;
      }
      if (current.value === "as") {
        expectModule = false;
        cursor++;
        continue;
      }
      if (expectModule && current.kind === "identifier") {
        if (!ALLOWED_IMPORTS.has(current.value)) {
          throw new PolicyViolationError(
            `Generated code must not import network-capable or filesystem module ${current.value}; only json and pandas are allowed.`,
          );
        }
        expectModule = false;
      }
    }
  }
}

function validateCalls(tokens: PythonToken[], sandboxPath: string): void {
  const csvCalls = findMethodCalls(tokens, "pd", "read_csv");
  const exactCsvCalls = csvCalls.filter(
    (arguments_) =>
      arguments_.length === 1 &&
      arguments_[0]?.kind === "string" &&
      arguments_[0].value === sandboxPath,
  );
  if (csvCalls.length !== 1 || exactCsvCalls.length !== 1) {
    throw new PolicyViolationError(
      `Generated code must call pd.read_csv with ${sandboxPath} exactly once.`,
    );
  }

  const printCalls = findFunctionCalls(tokens, "print");
  if (printCalls.length !== 1) {
    throw new PolicyViolationError("Generated code must contain exactly one print statement.");
  }
  const printArguments = printCalls[0] ?? [];
  if (
    !printArguments.some(
      (token) =>
        token.kind === "string" && token.value.includes("VERA_RESULT:"),
    )
  ) {
    throw new PolicyViolationError("Generated code must print one VERA_RESULT line.");
  }
  if (!hasSequence(printArguments, ["json", ".", "dumps", "("])) {
    throw new PolicyViolationError("Generated result output must use json.dumps.");
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (
      token?.kind === "identifier" &&
      FORBIDDEN_CALLS.has(token.value) &&
      tokens[index + 1]?.value === "("
    ) {
      throw new PolicyViolationError(`Generated code must not call ${token.value}.`);
    }
    if (
      token?.value === "." &&
      tokens[index + 1]?.kind === "identifier" &&
      FORBIDDEN_PANDAS_IO.has(tokens[index + 1]?.value ?? "")
    ) {
      const method = tokens[index + 1]?.value;
      if (
        !(
          tokens[index - 1]?.value === "pd" &&
          method === "read_csv" &&
          tokens[index + 2]?.value === "("
        )
      ) {
        throw new PolicyViolationError(
          `Generated code must not perform extra pandas I/O via ${method}.`,
        );
      }
    }
  }
}

function callUsesDateWithFormat(
  call: PythonToken[],
  column: string,
  format: string,
): boolean {
  const directReference =
    hasSequence(call, ["df", "[", column, "]"]) ||
    hasSequence(call, ["df", ".", column]) ||
    (hasSequence(call, ["df", ".", "loc"]) &&
      call.some((token) => token.kind === "string" && token.value === column));
  const exactFormat = call.some(
    (token, index) =>
      token.value === "format" &&
      call[index + 1]?.value === "=" &&
      call[index + 2]?.kind === "string" &&
      call[index + 2]?.value === format,
  );
  return directReference && exactFormat;
}

export function validatePythonPolicy(options: PythonPolicyOptions): void {
  try {
    validate(options);
  } catch (error) {
    // Carry the rejected program on the error so a retry can show the model
    // its own mistake, exactly as an execution failure carries its stderr.
    if (error instanceof PolicyViolationError && !error.code) {
      throw new PolicyViolationError(error.message, options.code);
    }
    throw error;
  }
}

function validate(options: PythonPolicyOptions): void {
  const tokens = tokenizePython(options.code);
  validateImports(tokens);
  validateCalls(tokens, options.sandboxPath);

  const executableValues = new Set(tokens.map((token) => token.value));
  const unknownColumn = options.columnsUsed.find(
    (column) => !options.knownColumns.includes(column),
  );
  if (unknownColumn) {
    throw new PolicyViolationError(`Generated code named unknown column ${unknownColumn}.`);
  }
  const unreferencedColumn = options.columnsUsed.find(
    (column) => !executableValues.has(column),
  );
  if (unreferencedColumn) {
    throw new PolicyViolationError(
      `columnsUsed names ${unreferencedColumn}, but the code does not reference it.`,
    );
  }

  const dateCalls = findMethodCalls(tokens, "pd", "to_datetime");
  for (const date of options.provenDateFormats) {
    const touchesDate =
      options.columnsUsed.includes(date.column) ||
      executableValues.has(date.column);
    if (!touchesDate) continue;
    if (
      !dateCalls.some((call) =>
        callUsesDateWithFormat(call, date.column, date.format),
      )
    ) {
      throw new PolicyViolationError(
        `Generated code touching ${date.column} must call pd.to_datetime on that column with format="${date.format}".`,
      );
    }
  }
}
