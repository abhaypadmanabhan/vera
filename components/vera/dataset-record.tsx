"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { formatBytes, formatCount, looksNumeric } from "./format";
import type { DatasetSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The file on record.
 *
 * The demo CSV is 2.3 MB and stays on the server — everything here comes from the
 * `DatasetSummary` the server component handed down: schema, an 8-row preview,
 * and the profiler's plain-English notes. Those notes are what the codegen prompt
 * will be given, so showing them is showing the actual input, not a description.
 */
export function DatasetRecord({
  dataset,
  isDemo,
  disabled,
  isProfiling,
  error,
  onFile,
  onResetToDemo,
}: {
  dataset: DatasetSummary;
  isDemo: boolean;
  disabled: boolean;
  isProfiling: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onResetToDemo: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  const columns = dataset.columns.map((column) => column.name);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsOver(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={onDrop}
      className={cn("transition-colors duration-150", isOver && "bg-mark-wash/60")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule pb-2">
        <h2 className="v-label text-ink">The file on record</h2>
        <p className="v-label">
          {isDemo ? "Demo file, read from the server" : "Your upload, profiled in this browser session"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <p className="font-mono text-meta text-ink">{dataset.filename}</p>
        <p className="v-nums font-mono text-note text-ink-muted">
          {formatCount(dataset.rowCount)} rows × {formatCount(columns.length)} columns ·{" "}
          {formatBytes(dataset.sizeBytes)}
          {dataset.duplicateRowCount > 0
            ? ` · ${formatCount(dataset.duplicateRowCount)} duplicated rows`
            : ""}
        </p>
      </div>

      {dataset.notes.length > 0 ? (
        <div className="mt-5">
          <p className="v-label">What the profiler found before any model saw the file</p>
          <ul className="mt-2 max-w-[68ch] space-y-2">
            {dataset.notes.slice(0, 4).map((note) => (
              <li key={note} className="flex gap-2 font-serif text-body">
                <span aria-hidden className="text-mark">
                  ↳
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        tabIndex={0}
        role="region"
        aria-label={`Preview of ${dataset.filename}, scrolls sideways`}
        className="mt-5 overflow-x-auto border border-rule bg-paper-deep"
      >
        <table className="w-full min-w-max border-collapse text-left font-mono text-note">
          <caption className="v-label px-4 pt-3 pb-2 text-left">
            Preview · first {dataset.previewRows.length} rows, not evidence · scroll for all{" "}
            {formatCount(columns.length)} columns
          </caption>
          <thead>
            <tr className="border-y border-rule">
              {columns.map((column) => (
                <th key={column} scope="col" className="v-label px-3 py-2 text-left font-normal">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.previewRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-rule/70 last:border-b-0">
                {columns.map((column, index) => (
                  <td
                    key={column}
                    className={cn(
                      "v-nums max-w-[22ch] truncate px-3 py-1.5",
                      looksNumeric(row[index] ?? "") ? "text-right" : "text-left",
                    )}
                  >
                    {row[index] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        {/* Driven by the button beside it, so it stays out of the tab order. */}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled || isProfiling}
          onClick={() => inputRef.current?.click()}
          className="v-pen v-label text-ink disabled:cursor-not-allowed"
        >
          {isProfiling ? "Profiling…" : "Put your own CSV on record"}
        </button>
        {!isDemo ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onResetToDemo}
            className="v-label text-ink-muted transition-[color] duration-150 hover:text-ink disabled:cursor-not-allowed"
          >
            Return to the demo file
          </button>
        ) : (
          <p className="v-label">or drop one anywhere on this section</p>
        )}
      </div>

      {error ? (
        <p className="mt-3 border-l-2 border-mark pl-3 font-serif text-body text-ink">{error}</p>
      ) : null}
    </section>
  );
}
