import { ExhibitCode } from "./exhibit-code";
import { Stamp } from "./stamp";
import { BLOCK_REASON_COPY } from "@/lib/types";
import type { DatasetSummary, Finding } from "@/lib/types";

type RefusedFinding = Extract<Finding, { verdict: "unverified" }>;

/**
 * A run that produced no number Vera will stand behind.
 *
 * The type makes this structurally safe — the `unverified` branch has no `value`
 * field, so there is nothing here that could leak an unproven figure. The design
 * makes it deliberate: a struck placeholder where the figure would sit, a red
 * rule, and the reason in plain English. Refusing is the product working.
 */
export function FindingRefused({
  finding,
  question,
  dataset,
}: {
  finding: RefusedFinding;
  question: string;
  dataset: DatasetSummary;
}) {
  const provenFormats = dataset.columns
    .map((column) => column.dateFormat)
    .filter((format): format is string => format !== null);

  return (
    <section aria-labelledby="refusal-heading">
      <p className="v-label">The finding</p>
      <h2 id="refusal-heading" className="sr-only">
        No number released
      </h2>
      <p className="mt-2 max-w-[46ch] font-serif text-claim tracking-[-0.02em] text-ink-muted italic">
        {question}
      </p>

      <hr className="v-draw mt-6 border-0 border-t border-ink" />

      <div className="mt-8 flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          {/*
            The figure's slot, left blank and struck through corner to corner —
            the mark an auditor puts through space that must stay empty. The
            absence is composed, not apologetic.
          */}
          <div
            aria-hidden
            className="v-uncover relative h-[5.5rem] w-[22rem] max-w-full border border-rule bg-paper-deep"
          >
            <svg
              className="absolute inset-0 size-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <line
                x1="0"
                y1="100"
                x2="100"
                y2="0"
                stroke="var(--color-mark)"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <p className="v-label mt-2">The figure&rsquo;s place, left blank</p>
          <p className="sr-only">No number released.</p>
          <p className="mt-7 max-w-[34ch] font-serif text-claim tracking-[-0.02em]">
            Vera has no number for this one.
          </p>
        </div>
        <Stamp>No number released</Stamp>
      </div>

      <hr className="v-draw mt-8 border-0 border-t-2 border-mark" />

      <div className="mt-6 max-w-[68ch] space-y-3">
        <p className="font-serif text-body">{BLOCK_REASON_COPY[finding.reason]}</p>
        <p className="font-mono text-meta text-ink-muted">{finding.detail}</p>
        <p className="v-label">
          {finding.attempts === 1 ? "One attempt" : `${finding.attempts} attempts`} · nothing traced
          back to a real cell · reason code {finding.reason}
        </p>
      </div>

      {finding.code ? (
        <ExhibitCode
          code={finding.code}
          provenFormats={provenFormats}
          note={`attempted, not accepted · ${finding.code.lineCount} lines`}
        />
      ) : null}
    </section>
  );
}
