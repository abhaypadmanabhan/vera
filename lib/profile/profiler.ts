import { parseCsv } from "../csv";
import type {
  ColumnKind,
  ColumnProfile,
  DatasetProfile,
  SchemaEvidence,
} from "../types";

/**
 * Deterministic dataset profiler.
 *
 * Everything here is counted from the real cells. Nothing is guessed, and no fact
 * is asserted without the counts that prove it (`SchemaEvidence`). The profile is
 * what the codegen prompt sees — the model never receives the whole file.
 *
 * The headline case: a column of `DD/MM/YYYY` dates. `pandas.to_datetime` defaults
 * to month-first and silently drops or mis-parses those rows. We prove the format
 * from the data (values whose first component exceeds 12 cannot be months) and hand
 * the proven strftime format to the generated code.
 */

const DATE_SLASH = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isBlank(value: string): boolean {
  return value.trim() === "";
}

function isNumeric(value: string): boolean {
  if (isBlank(value)) return false;
  return Number.isFinite(Number(value.replace(/[$,%]/g, "").trim()));
}

function isInteger(value: string): boolean {
  return isNumeric(value) && Number.isInteger(Number(value.replace(/[$,%]/g, "").trim()));
}

/**
 * Decide day-first vs month-first by counting, not by guessing.
 *
 * A value like `15/04/2019` can only be day-first: 15 is not a month. If any value
 * proves day-first and none proves month-first, the format is proven. If both or
 * neither are proven, we return evidence with a non-zero `contradictingRows` and the
 * caller must NOT act on it — an ambiguous column is reported, not resolved.
 */
function proveSlashDateFormat(values: string[], column: string): {
  format: string | null;
  evidence: SchemaEvidence;
} {
  let dayFirstProof = 0;
  let monthFirstProof = 0;
  const dayFirstExamples: string[] = [];
  const monthFirstExamples: string[] = [];

  for (const value of values) {
    const match = DATE_SLASH.exec(value.trim());
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) {
      dayFirstProof++;
      if (dayFirstExamples.length < 3 && !dayFirstExamples.includes(value)) dayFirstExamples.push(value);
    } else if (second > 12 && first <= 12) {
      monthFirstProof++;
      if (monthFirstExamples.length < 3 && !monthFirstExamples.includes(value)) monthFirstExamples.push(value);
    }
  }

  const dayFirstWins = dayFirstProof > 0 && monthFirstProof === 0;
  const monthFirstWins = monthFirstProof > 0 && dayFirstProof === 0;

  if (dayFirstWins || monthFirstWins) {
    const format = dayFirstWins ? "%d/%m/%Y" : "%m/%d/%Y";
    const label = dayFirstWins ? "DD/MM/YYYY" : "MM/DD/YYYY";
    const position = dayFirstWins ? "first" : "second";
    const supporting = dayFirstWins ? dayFirstProof : monthFirstProof;
    const contradicting = dayFirstWins ? monthFirstProof : dayFirstProof;
    return {
      format,
      evidence: {
        claim: `${column} is ${label}`,
        supportingRows: supporting,
        contradictingRows: contradicting,
        examples: dayFirstWins ? dayFirstExamples : monthFirstExamples,
        method:
          `${supporting.toLocaleString()} values have a ${position} component above 12, ` +
          `which cannot be a month. ${contradicting.toLocaleString()} values argue the other way. ` +
          `Parsing this column with the default month-first assumption drops or mis-reads those rows silently.`,
      },
    };
  }

  // Genuinely ambiguous: every value could be read either way. Report, do not resolve.
  return {
    format: null,
    evidence: {
      claim: `${column} date order could not be proven from the data`,
      supportingRows: 0,
      contradictingRows: dayFirstProof + monthFirstProof,
      examples: values.slice(0, 3),
      method:
        "Every value in this column is valid read either day-first or month-first, so the order " +
        "cannot be established from the data alone. Vera will not assume one.",
    },
  };
}

function profileColumn(name: string, values: string[]): ColumnProfile {
  const nonBlank = values.filter((v) => !isBlank(v));
  const nullCount = values.length - nonBlank.length;
  const distinct = new Set(nonBlank);
  const sampleValues = [...distinct].slice(0, 5);

  const slashDates = nonBlank.filter((v) => DATE_SLASH.test(v.trim()));
  const isoDates = nonBlank.filter((v) => ISO_DATE.test(v.trim()));

  let kind: ColumnKind = "text";
  let dateFormat: string | null = null;
  let evidence: SchemaEvidence | null = null;

  if (nonBlank.length > 0 && slashDates.length === nonBlank.length) {
    kind = "date";
    const proof = proveSlashDateFormat(nonBlank, name);
    dateFormat = proof.format;
    evidence = proof.evidence;
  } else if (nonBlank.length > 0 && isoDates.length === nonBlank.length) {
    kind = "date";
    dateFormat = "%Y-%m-%d";
    evidence = {
      claim: `${name} is ISO YYYY-MM-DD`,
      supportingRows: isoDates.length,
      contradictingRows: 0,
      examples: sampleValues,
      method: `All ${isoDates.length.toLocaleString()} non-empty values match YYYY-MM-DD, which is unambiguous.`,
    };
  } else if (nonBlank.length > 0 && nonBlank.every(isInteger)) {
    kind = "integer";
  } else if (nonBlank.length > 0 && nonBlank.every(isNumeric)) {
    kind = "number";
  } else if (distinct.size > 0 && distinct.size <= Math.max(20, nonBlank.length * 0.05)) {
    kind = "category";
  } else if (distinct.size === nonBlank.length && nonBlank.length > 0) {
    kind = "id";
  }

  return {
    name,
    kind,
    nullCount,
    distinctCount: distinct.size,
    sampleValues,
    dateFormat,
    evidence,
  };
}

/** Parse a value using a format we have already PROVEN. Returns null if it does not fit. */
function parseWithProvenFormat(value: string, format: string): Date | null {
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;

  if (format === "%Y-%m-%d") {
    const m = ISO_DATE.exec(trimmed);
    if (!m) return null;
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    const m = DATE_SLASH.exec(trimmed);
    if (!m) return null;
    const first = Number(m[1]);
    const second = Number(m[2]);
    year = Number(m[3]);
    if (format === "%d/%m/%Y") {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Cross-check "convenience" period columns (Year / Quarter / Month) against the
 * date column we have proven.
 *
 * This matters more than it looks. A stated period column that disagrees with the
 * real dates is worse than a messy one: code that uses it RUNS CLEANLY and returns
 * a wrong number — the exact failure PRD §6 says we cannot catch after the fact.
 * So we catch it before, by counting. No inference, no guessing: derive the period
 * from the proven date, compare, count the disagreements.
 */
function crossCheckPeriodColumns(
  dateColumn: string,
  dateFormat: string,
  dateValues: string[],
  columns: string[],
  columnValues: Map<string, string[]>,
): SchemaEvidence[] {
  const derived = dateValues.map((value) => parseWithProvenFormat(value, dateFormat));
  const findings: SchemaEvidence[] = [];

  const kinds: { test: RegExp; label: string; of: (d: Date) => number }[] = [
    { test: /year/i, label: "year", of: (d) => d.getUTCFullYear() },
    { test: /quarter/i, label: "quarter", of: (d) => Math.floor(d.getUTCMonth() / 3) + 1 },
    { test: /month/i, label: "month", of: (d) => d.getUTCMonth() + 1 },
  ];

  // Only compare columns that describe the SAME event. "Order Quarter" belongs to
  // "OrderDate", not to "ShipDate" — an order shipped in the next quarter is normal,
  // not a data problem, and reporting it would mislead the model.
  const subject = (name: string, strip: RegExp) =>
    name.toLowerCase().replace(strip, "").replace(/[^a-z0-9]/g, "");
  const dateSubject = subject(dateColumn, /date/g);

  for (const column of columns) {
    if (column === dateColumn) continue;
    const kind = kinds.find((k) => k.test.test(column));
    if (!kind) continue;
    if (subject(column, /year|quarter|month/g) !== dateSubject) continue;
    const stated = columnValues.get(column);
    if (!stated) continue;

    let compared = 0;
    let mismatched = 0;
    const examples: string[] = [];

    for (let i = 0; i < derived.length; i++) {
      const date = derived[i];
      const raw = stated[i];
      if (!date || raw === undefined || raw.trim() === "") continue;
      const statedNumber = Number(raw);
      if (!Number.isFinite(statedNumber)) continue;
      compared++;
      if (statedNumber !== kind.of(date)) {
        mismatched++;
        const example = `${dateValues[i]} → ${kind.label} ${kind.of(date)}, but "${column}" says ${raw}`;
        if (examples.length < 3 && !examples.includes(example)) examples.push(example);
      }
    }

    if (compared === 0) continue;

    if (mismatched > 0) {
      findings.push({
        claim: `"${column}" disagrees with the ${kind.label} of "${dateColumn}"`,
        supportingRows: mismatched,
        contradictingRows: 0,
        examples,
        method:
          `${mismatched.toLocaleString()} of ${compared.toLocaleString()} rows have a "${column}" value that does not match ` +
          `the ${kind.label} of their "${dateColumn}" (parsed ${dateFormat}). Code that trusts "${column}" runs cleanly and ` +
          `returns a wrong number, so derive the ${kind.label} from "${dateColumn}" instead.`,
      });
    } else {
      findings.push({
        claim: `"${column}" agrees with the ${kind.label} of "${dateColumn}" on every row`,
        supportingRows: compared,
        contradictingRows: 0,
        examples: [],
        method: `All ${compared.toLocaleString()} comparable rows match. Either column is safe for ${kind.label}.`,
      });
    }
  }

  return findings;
}

export function profileDataset(
  datasetId: string,
  filename: string,
  content: string,
): DatasetProfile {
  const rows = parseCsv(content);
  const [header, ...body] = rows;
  const columns = header ?? [];

  const columnProfiles = columns.map((name, index) =>
    profileColumn(
      name,
      body.map((row) => row[index] ?? ""),
    ),
  );

  const seen = new Set<string>();
  let duplicateRowCount = 0;
  for (const row of body) {
    const key = row.join(" ");
    if (seen.has(key)) duplicateRowCount++;
    else seen.add(key);
  }

  // Cross-check convenience period columns against every date column we proved.
  const columnValues = new Map<string, string[]>(
    columns.map((name, index) => [name, body.map((row) => row[index] ?? "")]),
  );
  const crossChecks: SchemaEvidence[] = [];
  for (const column of columnProfiles) {
    if (column.kind !== "date" || !column.dateFormat) continue;
    crossChecks.push(
      ...crossCheckPeriodColumns(
        column.name,
        column.dateFormat,
        columnValues.get(column.name) ?? [],
        columns,
        columnValues,
      ),
    );
  }

  const notes: string[] = [];
  for (const check of crossChecks) {
    if (check.claim.includes("disagrees")) notes.push(check.method);
  }
  for (const column of columnProfiles) {
    if (column.kind === "date" && column.dateFormat) {
      notes.push(
        `Parse "${column.name}" with format="${column.dateFormat}" — ${column.evidence?.method ?? ""}`.trim(),
      );
    } else if (column.kind === "date" && !column.dateFormat) {
      notes.push(
        `"${column.name}" looks like a date but its day/month order cannot be proven from the data. Do not derive an answer from it without saying so.`,
      );
    }
    if (column.nullCount > 0) {
      notes.push(`"${column.name}" has ${column.nullCount.toLocaleString()} empty cells.`);
    }
  }
  if (duplicateRowCount > 0) {
    notes.push(
      `${duplicateRowCount.toLocaleString()} exactly duplicated row(s) are present. Decide deliberately whether the question counts rows or unique entities.`,
    );
  }

  return {
    datasetId,
    filename,
    rowCount: body.length,
    columns: columnProfiles,
    duplicateRowCount,
    crossChecks,
    notes,
  };
}
