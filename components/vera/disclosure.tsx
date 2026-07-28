"use client";

import { ChevronRight } from "lucide-react";
import type { SourceCell } from "@/lib/types";
import { cn } from "@/lib/utils";
import { looksNumeric } from "./format";

/**
 * The proof is one click away, never a wall of text on arrival (DESIGN.md v3).
 * Native `<details>` so the keyboard path and the screen-reader semantics come
 * for free — nothing here re-implements a disclosure.
 */
export function Disclosure({
  label,
  meta,
  children,
  className,
}: {
  label: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group border-t border-line", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3.5 text-small text-ink-muted transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3.5 shrink-0 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        <span className="text-ink">{label}</span>
        {meta && <span className="ml-auto font-mono text-micro tabular-nums">{meta}</span>}
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

/** The exact source that was executed. Never reformatted between run and display. */
export function CodeBlock({ source }: { source: string }) {
  return (
    <pre className="max-h-[22rem] overflow-auto rounded-xl border border-line bg-sunk p-4 font-mono text-micro leading-[1.7] text-ink">
      <code>{source}</code>
    </pre>
  );
}

/** Real cells, quoted back. Numerics right-aligned; the table scrolls in itself. */
export function CellsTable({ cells }: { cells: SourceCell[] }) {
  if (cells.length === 0) {
    return <p className="text-small text-ink-muted">No sample cells were recorded for this run.</p>;
  }

  return (
    <div className="max-h-[22rem] overflow-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-micro">
        <thead className="sticky top-0 bg-sunk">
          <tr className="text-left">
            <th scope="col" className="v-label px-4 py-2.5 font-normal">
              Row
            </th>
            <th scope="col" className="v-label px-4 py-2.5 font-normal">
              Column
            </th>
            <th scope="col" className="v-label px-4 py-2.5 font-normal">
              Value
            </th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {cells.map((cell, index) => (
            <tr key={`${cell.row}-${cell.column}-${index}`} className="border-t border-line">
              <td className="px-4 py-2 text-right tabular-nums text-ink-muted">{cell.row}</td>
              <td className="px-4 py-2 text-ink-muted">{cell.column}</td>
              <td
                className={cn(
                  "px-4 py-2 text-ink",
                  looksNumeric(cell.value) && "text-right tabular-nums",
                )}
              >
                {cell.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
