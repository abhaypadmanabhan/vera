const AUDIT_PREFIX = "VERA_AUDIT:";

export interface AuditCounts {
  rowsBefore: number;
  rowsAfter: number;
  duplicatesDropped: number;
  cellsCoerced: number;
  /** Present when prep widened the schema; added cells are not coercions. */
  columnsAdded?: number;
}

/** A fixed Python program. The model never writes this. */
export function buildAuditProgram(
  sourcePath: string,
  cleanPath: string,
): string {
  return [
    "import json",
    "from collections import Counter",
    "import pandas as pd",
    `before = pd.read_csv(${JSON.stringify(sourcePath)}, dtype=str, keep_default_na=False)`,
    `prepared = pd.read_csv(${JSON.stringify(cleanPath)}, dtype=str, keep_default_na=False)`,
    "counts = None",
    "shared_columns = [column for column in before.columns if column in prepared.columns]",
    "added_columns = [column for column in prepared.columns if column not in before.columns]",
    "if len(shared_columns) == len(before.columns) and len(before) == len(prepared):",
    "    prepared_shared = prepared[shared_columns]",
    "    reordered = False",
    "    for column in shared_columns:",
    "        original = before[column].tolist()",
    "        changed = prepared_shared[column].tolist()",
    "        if original != changed and Counter(original) == Counter(changed):",
    "            reordered = True",
    "    if not reordered:",
    "        cells_coerced = int((before[shared_columns] != prepared_shared).to_numpy().sum())",
    "        after = prepared.drop_duplicates()",
    `        after.to_csv(${JSON.stringify(cleanPath)}, index=False)`,
    "        counts = {",
    '            "rowsBefore": int(len(before)),',
    '            "rowsAfter": int(len(after)),',
    '            "duplicatesDropped": int(len(prepared) - len(after)),',
    '            "cellsCoerced": cells_coerced,',
    '            "columnsAdded": int(len(added_columns)),',
    "        }",
    "if counts is None:",
    '    print("VERA_AUDIT_UNAVAILABLE")',
    "else:",
    `    print(${JSON.stringify(AUDIT_PREFIX)} + json.dumps(counts, separators=(",", ":")))`,
  ].join("\n");
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function parseAuditOutput(stdout: string): AuditCounts | null {
  const line = stdout
    .split("\n")
    .reverse()
    .find((candidate) => candidate.trim().startsWith(AUDIT_PREFIX));
  if (!line) return null;

  try {
    const parsed: unknown = JSON.parse(
      line.trim().slice(AUDIT_PREFIX.length),
    );
    if (parsed === null || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    if (
      !isNonnegativeSafeInteger(record.rowsBefore) ||
      !isNonnegativeSafeInteger(record.rowsAfter) ||
      !isNonnegativeSafeInteger(record.duplicatesDropped) ||
      !isNonnegativeSafeInteger(record.cellsCoerced) ||
      (record.columnsAdded !== undefined &&
        !isNonnegativeSafeInteger(record.columnsAdded))
    ) {
      return null;
    }
    if (
      record.rowsAfter > record.rowsBefore ||
      record.duplicatesDropped > record.rowsBefore - record.rowsAfter
    ) {
      return null;
    }

    const counts: AuditCounts = {
      rowsBefore: record.rowsBefore,
      rowsAfter: record.rowsAfter,
      duplicatesDropped: record.duplicatesDropped,
      cellsCoerced: record.cellsCoerced,
    };
    if (
      isNonnegativeSafeInteger(record.columnsAdded) &&
      record.columnsAdded > 0
    ) {
      counts.columnsAdded = record.columnsAdded;
    }
    return counts;
  } catch {
    return null;
  }
}
