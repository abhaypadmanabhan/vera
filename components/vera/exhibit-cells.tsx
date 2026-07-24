import { Exhibit } from "./exhibit";
import { formatCount, looksNumeric } from "./format";
import type { Grounding } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Exhibit B — the cells she read.
 *
 * Real values, quoted back from the file. The columns the executed code actually
 * touched carry the red pen, so you can see *which* cells at a glance against the
 * full column list of the file.
 */
export function ExhibitCells({
  grounding,
  allColumns,
}: {
  grounding: Grounding;
  /** Every column in the file, so the marked ones read as a selection. */
  allColumns: string[];
}) {
  const read = new Set(grounding.columns);
  const columns = grounding.columns;

  const rowIndexes = [...new Set(grounding.sampleCells.map((cell) => cell.row))].sort(
    (a, b) => a - b,
  );
  const rows = rowIndexes.map((row) => ({
    row,
    values: columns.map(
      (column) =>
        grounding.sampleCells.find((cell) => cell.row === row && cell.column === column)?.value ??
        "",
    ),
  }));

  const range =
    grounding.rowRange !== null
      ? `rows ${formatCount(grounding.rowRange[0])}–${formatCount(grounding.rowRange[1])}`
      : `${formatCount(grounding.rowCount)} rows`;

  const columnList = allColumns.length > 0 ? allColumns : columns;

  return (
    <Exhibit
      letter="B"
      title="The cells she read"
      note={`${formatCount(grounding.rowCount)} rows · ${columns.length} of ${columnList.length} columns`}
    >
      <div className="border-b border-rule px-4 py-3">
        <p className="v-label mb-1.5">Columns in this file · marked ones were read</p>
        <p className="font-mono text-note leading-6">
          {columnList.map((column, index) => (
            <span key={column}>
              <span
                className={cn(
                  read.has(column) ? "v-marked px-1 text-ink" : "text-ink-muted",
                )}
              >
                {column}
              </span>
              {index < columnList.length - 1 ? <span aria-hidden className="px-1.5">·</span> : null}
            </span>
          ))}
        </p>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-label="The quoted cells, scrolls sideways"
        className="overflow-x-auto"
      >
        <table className="w-full min-w-max border-collapse text-left font-mono text-meta">
          <caption className="v-label px-4 pt-3 pb-2 text-left">
            {rows.length} rows quoted verbatim from {range}
          </caption>
          <thead>
            <tr className="border-y border-rule">
              <th scope="col" className="v-label px-4 py-2 text-left font-normal">
                Row
              </th>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-4 py-2 text-left font-normal">
                  <span className="v-marked v-label px-1 text-ink">{column}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, values }) => (
              <tr key={row} className="border-b border-rule/70 last:border-b-0">
                <th
                  scope="row"
                  className="v-nums px-4 py-2 text-left text-note font-normal text-ink-muted"
                >
                  {formatCount(row)}
                </th>
                {values.map((value, index) => (
                  <td
                    key={columns[index]}
                    className={cn(
                      "v-nums px-4 py-2",
                      looksNumeric(value) ? "text-right" : "text-left",
                    )}
                  >
                    <span className="v-marked px-1">{value || "—"}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Exhibit>
  );
}
