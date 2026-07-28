"use client";

import { Fragment, type ReactNode } from "react";
import { isProven, type ColumnProfile, type DatasetSummary, type SchemaEvidence } from "@/lib/types";
import { Disclosure } from "./disclosure";
import { formatBytes, formatCount } from "./format";
import { UploadButton } from "./upload-dropzone";

/**
 * The file every question on this screen is about — three lines of it at rest.
 *
 * This panel used to arrive fully expanded: a five-row table, both proven claims
 * with their counts and three example values each, and all 22 column names. On a
 * screen DESIGN.md wants to "feel like it is waiting, not loading" that made the
 * file the loudest object on the page.
 *
 * Nothing was deleted. Everything past the filename and one line of shape now
 * sits behind a disclosure the reader opens, and each summary carries its own
 * count so it says what is inside before the click. None open on arrival.
 *
 * Every figure still comes off the `DatasetSummary` the server computed. Nothing
 * is estimated, rounded into a claim, or invented — the sums below are sums of
 * fields, and the proven facts still carry the counts that prove them.
 */

interface ProvenColumn extends ColumnProfile {
  evidence: SchemaEvidence;
}

/**
 * A fact is shown as proved only when something supports it and nothing
 * contradicts it (`isProven`) — a column that reads validly both ways yields
 * 0 and 0, which is no contradiction but also no proof.
 */
function provenColumns(columns: readonly ColumnProfile[]): ProvenColumn[] {
  return columns.filter(
    (column): column is ProvenColumn => column.evidence !== null && isProven(column.evidence),
  );
}

/** "1 row" / "9,994 rows". The shape line is a sentence, so it agrees with itself. */
function plural(count: number, noun: string): string {
  return `${formatCount(count)} ${noun}${count === 1 ? "" : "s"}`;
}

export function HomeDatasetPanel({
  dataset,
  onFile,
  busy,
  prep,
}: {
  dataset: DatasetSummary;
  onFile: (file: File) => void;
  busy: boolean;
  /** The prep sequence for a file being uploaded right now, if there is one. */
  prep?: ReactNode;
}) {
  const emptyCells = dataset.columns.reduce((total, column) => total + column.nullCount, 0);
  const proven = provenColumns(dataset.columns);

  const measured: { label: string; value: string }[] = [
    { label: "Rows", value: formatCount(dataset.rowCount) },
    { label: "Columns", value: formatCount(dataset.columns.length) },
    { label: "Size", value: formatBytes(dataset.sizeBytes) },
    { label: "Empty cells", value: formatCount(emptyCells) },
    { label: "Duplicate rows", value: formatCount(dataset.duplicateRowCount) },
  ];

  const shape = [
    plural(dataset.rowCount, "row"),
    plural(dataset.columns.length, "column"),
    formatBytes(dataset.sizeBytes),
  ].join(" · ");

  return (
    <aside
      aria-label="The file on record"
      className="v-reveal lg:border-l lg:border-line lg:pl-8"
      style={{ ["--step" as string]: 3 }}
    >
      {prep}

      {/*
       * The one action on this column sits with the thing it acts on, not in a
       * panel of its own (B2B SaaS Playbook, "contextual actions").
       */}
      <div className="flex items-center justify-between gap-3">
        <p className="v-label">The file on record</p>
        <UploadButton onFile={onFile} busy={busy} />
      </div>
      <p className="mt-1.5 font-mono text-lead break-words text-ink">{dataset.filename}</p>
      {/* Sans, not mono: a sentence about the file, not a value read out of it. */}
      <p className="v-nums mt-1.5 text-small text-ink-muted">{shape}</p>

      {/* Each disclosure draws its own rule above; the wrapper closes the stack. */}
      <div className="mt-6 border-b border-line">
        <Disclosure label="What she measured" meta={formatCount(measured.length)}>
          <dl>
            {measured.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-b-0"
              >
                <dt className="text-small text-ink-muted">{row.label}</dt>
                <dd className="v-nums font-mono text-micro text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>

        {proven.length > 0 && (
          <Disclosure label="What she already proved" meta={formatCount(proven.length)}>
            <ul className="grid gap-4">
              {proven.map((column, index) => (
                <li key={`${index}-${column.name}`}>
                  <p className="text-small text-ink">{column.evidence.claim}</p>
                  <p className="v-nums text-small text-ink-muted">
                    {formatCount(column.evidence.supportingRows)} rows prove it,{" "}
                    {formatCount(column.evidence.contradictingRows)} argue otherwise
                  </p>
                  {column.evidence.examples.length > 0 && (
                    // Real cells, quoted back — the one place mono belongs here.
                    <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-micro text-ink-muted">
                      {column.evidence.examples.slice(0, 3).map((example, slot) => (
                        <span key={`${slot}-${example}`}>{example}</span>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}

        {dataset.notes.length > 0 && (
          <Disclosure label="The brief for the code" meta={formatCount(dataset.notes.length)}>
            <ol className="grid gap-3">
              {dataset.notes.map((note, index) => (
                <li
                  key={`${index}-${note}`}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)] text-small text-ink-muted"
                >
                  <span className="v-marker">{index + 1}</span>
                  <span>{note}</span>
                </li>
              ))}
            </ol>
          </Disclosure>
        )}

        <Disclosure label="Columns" meta={formatCount(dataset.columns.length)}>
          {/* A name never breaks across lines; the separators are the wrap points. */}
          <p className="font-mono text-micro text-ink-muted">
            {dataset.columns.map((column, index) => (
              <Fragment key={`${index}-${column.name}`}>
                {index > 0 && <span aria-hidden> · </span>}
                <span className="whitespace-nowrap">{column.name}</span>
              </Fragment>
            ))}
          </p>
        </Disclosure>
      </div>
    </aside>
  );
}
