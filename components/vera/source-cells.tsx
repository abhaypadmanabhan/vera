import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { looksNumeric } from "./format";
import { cn } from "@/lib/utils";
import type { Grounding } from "@/lib/types";

/**
 * The receipt. Real cells from the file, quoted back under the number so the
 * claim can be checked by eye rather than taken on trust.
 */
export function SourceCells({ grounding }: { grounding: Grounding }) {
  const rows = [...new Set(grounding.sampleCells.map((cell) => cell.row))].sort((a, b) => a - b);
  const byRow = new Map<number, Map<string, string>>();
  for (const cell of grounding.sampleCells) {
    const row = byRow.get(cell.row) ?? new Map<string, string>();
    row.set(cell.column, cell.value);
    byRow.set(cell.row, row);
  }

  // A column is numeric when every cell in it reads as one; headers align with
  // their values so the eye can scan a column top to bottom.
  const numericColumns = new Set(
    grounding.columns.filter((column) => {
      const values = grounding.sampleCells.filter((cell) => cell.column === column);
      return values.length > 0 && values.every((cell) => looksNumeric(cell.value));
    }),
  );

  if (rows.length === 0 || grounding.columns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The run reported no cells to quote back. Without cells there is nothing to check, so treat
        this number as untraced.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md ring-1 ring-border">
        <div className="max-h-64 overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-surface-raised">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-16 px-3 font-mono text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
                  Row
                </TableHead>
                {grounding.columns.map((column) => (
                  <TableHead
                    key={column}
                    className={cn(
                      "px-3 font-mono text-[0.6875rem] font-medium tracking-wide text-muted-foreground",
                      numericColumns.has(column) && "text-right",
                    )}
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((rowIndex) => (
                <TableRow key={rowIndex} className="border-border">
                  <TableCell className="vera-nums px-3 font-mono text-muted-foreground">
                    {rowIndex}
                  </TableCell>
                  {grounding.columns.map((column) => {
                    const value = byRow.get(rowIndex)?.get(column) ?? "—";
                    return (
                      <TableCell
                        key={column}
                        className={cn(
                          "px-3 font-mono",
                          numericColumns.has(column) && "vera-nums text-right",
                        )}
                      >
                        {value}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="vera-nums">{rows.length}</span> of{" "}
        <span className="vera-nums">{grounding.rowCount}</span> rows shown
        {grounding.rowRange
          ? `, covering rows ${grounding.rowRange[0]}–${grounding.rowRange[1]}`
          : ""}
        .
      </p>
    </div>
  );
}
