import { ExhibitCells } from "./exhibit-cells";
import { ExhibitCode } from "./exhibit-code";
import { ExhibitSchema } from "./exhibit-schema";
import { formatCount, formatDuration, formatFigure } from "./format";
import { Stamp } from "./stamp";
import type { DatasetSummary, Finding } from "@/lib/types";

type VerifiedFinding = Extract<Finding, { verdict: "verified" }>;

/**
 * A finding that carries a number.
 *
 * The number is set large in ink; the red pen is the annotation *around* it —
 * the stamp, the marked cells, the proven format. Nothing counts up: animating a
 * real figure would undercut the entire product.
 *
 * The claim on screen is exactly PRD §6's live claim — computed, and traceable.
 * It is not a claim of correctness, and no copy here may imply one.
 */
export function FindingVerified({
  finding,
  question,
  dataset,
}: {
  finding: VerifiedFinding;
  question: string;
  dataset: DatasetSummary;
}) {
  const provenFormats = dataset.columns
    .map((column) => column.dateFormat)
    .filter((format): format is string => format !== null);

  const allColumns = dataset.columns.map((column) => column.name);

  return (
    <section aria-labelledby="finding-heading">
      <p className="v-label">The finding</p>
      <h2 id="finding-heading" className="sr-only">
        Verified finding
      </h2>
      <p className="mt-2 max-w-[46ch] font-serif text-claim tracking-[-0.02em] text-ink-muted italic">
        {question}
      </p>

      <hr className="v-draw mt-6 border-0 border-t border-ink" />

      <div className="mt-8 flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <p className="v-nums font-mono text-figure tracking-[-0.03em] break-words">
            {formatFigure(finding.value, finding.unit)}
          </p>
          <p className="mt-5 max-w-[34ch] font-serif text-claim tracking-[-0.02em]">
            {finding.claim}
          </p>
        </div>
        <Stamp>Verified</Stamp>
      </div>

      <p className="v-label mt-8">
        Computed by the code in Exhibit A · exit {finding.execution.exitCode} ·{" "}
        <span className="v-nums">{formatDuration(finding.execution.durationMs)}</span> ·{" "}
        {finding.attempts === 1 ? "first attempt" : `${finding.attempts} attempts`} ·{" "}
        <span className="v-nums">{formatCount(finding.grounding.rowCount)}</span> rows read
      </p>

      <ExhibitCode
        code={finding.code}
        provenFormats={provenFormats}
        note={`${formatCount(finding.code.lineCount)} lines of ${finding.code.language} · stdout ${finding.execution.stdout.trim() || "—"}`}
      />
      <ExhibitCells grounding={finding.grounding} allColumns={allColumns} />
      <ExhibitSchema evidence={finding.grounding.schemaEvidence} />
    </section>
  );
}
