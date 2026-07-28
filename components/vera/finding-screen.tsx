"use client";

import { useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import type { DatasetSummary, Finding } from "@/lib/types";
import { BLOCK_REASON_COPY, isProven } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CellsTable, CodeBlock, Disclosure } from "./disclosure";
import { CoverageChart, EvidenceChart } from "./evidence-chart";
import { formatCount, formatDuration, formatFigure } from "./format";
import { SPOT, Spot, type SpotlightTarget } from "./spotlight";

/**
 * Screen 3 — The finding. Reveals in stages: the number and its one-line claim,
 * then one chart, then at most three insight cards, then a one-line source with
 * the code and the cells behind a disclosure (DESIGN.md v3).
 *
 * Every section is wrapped in `<Spot>`, so mode 2 (spotlight presentation) is a
 * matter of setting `spotlight` to a section id — see `spotlight.tsx`.
 */
export function FindingScreen({
  question,
  finding,
  dataset,
  onReset,
}: {
  question: string;
  finding: Finding;
  dataset: DatasetSummary;
  onReset: () => void;
}) {
  const [spotlight, setSpotlight] = useState<SpotlightTarget>(null);

  if (finding.verdict === "unverified") {
    return <UnverifiedFinding question={question} finding={finding} onReset={onReset} />;
  }

  const { grounding, execution, code } = finding;
  const proven = grounding.schemaEvidence.filter(isProven);
  const headlineEvidence = proven[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-4 pb-24">
      <p className="v-reveal text-small text-ink-muted" style={{ ["--step" as string]: 0 }}>
        {question}
      </p>

      {/* 1 — the number, and nothing else. */}
      <Spot id={SPOT.headline} spotlight={spotlight} className="mt-6">
        <div className="v-reveal-slow" style={{ ["--step" as string]: 1 }}>
          <p className="v-nums font-mono text-figure font-normal tracking-[-0.03em] text-ink">
            {formatFigure(finding.value, finding.unit)}
          </p>
          <p className="mt-5 max-w-[48ch] text-lead font-medium text-balance text-ink">
            {finding.claim}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-wash px-3 py-1.5 text-micro text-ink">
            <Check className="size-3.5 text-accent" strokeWidth={3} aria-hidden />
            Computed by code that ran on your file, and traced back to real cells
          </p>
        </div>
      </Spot>

      {/* 2 — one chart that makes the number make sense. */}
      <Spot id={SPOT.chart} spotlight={spotlight} className="mt-12">
        <section
          className="v-card v-reveal-slow p-6"
          style={{ ["--step" as string]: 2 }}
          aria-labelledby="vera-chart-title"
        >
          <h2 id="vera-chart-title" className="text-body font-medium text-ink">
            {headlineEvidence ? headlineEvidence.claim : "Rows behind this number"}
          </h2>
          <div className="mt-1">
            {headlineEvidence ? (
              <EvidenceChart evidence={headlineEvidence} />
            ) : (
              <CoverageChart rowsRead={grounding.rowCount} rowsInFile={dataset.rowCount} />
            )}
          </div>
        </section>
      </Spot>

      {/* 3 — at most three insight cards, each a single fact with its figure. */}
      <Spot id={SPOT.insights} spotlight={spotlight} className="mt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <InsightCard
            step={3}
            label="Rows read"
            value={formatCount(grounding.rowCount)}
            note={`of ${formatCount(dataset.rowCount)} in the file`}
          />
          <InsightCard
            step={4}
            label="Columns read"
            value={String(grounding.columns.length)}
            note={grounding.columns.join(", ") || "none recorded"}
          />
          <InsightCard
            step={5}
            label="Sandbox run"
            value={formatDuration(execution.durationMs)}
            note={`exit ${execution.exitCode} · ${finding.attempts} attempt${finding.attempts === 1 ? "" : "s"}`}
          />
        </div>
      </Spot>

      {/* 4 — one line of source, with the proof one click behind it. */}
      <Spot id={SPOT.source} spotlight={spotlight} className="mt-12">
        <section className="v-reveal" style={{ ["--step" as string]: 6 }}>
          <p className="text-small text-ink-muted">
            {code.explanation} Grounded in{" "}
            <span className="font-mono text-ink">{grounding.columns.join(", ")}</span> across{" "}
            <span className="v-nums font-mono text-ink">{formatCount(grounding.rowCount)}</span>{" "}
            rows of <span className="font-mono text-ink">{dataset.filename}</span>.
          </p>

          <div className="mt-4 border-b border-line">
            <Disclosure label="The code Vera ran" meta={`${code.lineCount} lines · python`}>
              <CodeBlock source={code.source} />
            </Disclosure>
            <Disclosure
              label="The cells it read"
              meta={`${formatCount(grounding.sampleCells.length)} shown`}
            >
              <CellsTable cells={grounding.sampleCells} />
            </Disclosure>
            {proven.length > 0 && (
              <Disclosure label="What Vera proved about the schema first" meta={`${proven.length}`}>
                <ul className="space-y-4">
                  {proven.map((evidence) => (
                    <li key={evidence.claim} className="rounded-xl border border-line bg-sunk p-4">
                      <p className="text-small font-medium text-ink">{evidence.claim}</p>
                      <p className="mt-1 text-small text-ink-muted">{evidence.method}</p>
                      <p className="v-nums mt-2 font-mono text-micro text-ink-muted">
                        {formatCount(evidence.supportingRows)} for ·{" "}
                        {formatCount(evidence.contradictingRows)} against
                      </p>
                      {evidence.examples.length > 0 && (
                        <p className="mt-2 font-mono text-micro text-ink-muted">
                          e.g. {evidence.examples.slice(0, 4).join("  ·  ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
            {execution.stdout.trim().length > 0 && (
              <Disclosure label="What the sandbox printed" meta="stdout">
                <CodeBlock source={execution.stdout.trimEnd()} />
              </Disclosure>
            )}
          </div>
        </section>
      </Spot>

      <PresentationPreview spotlight={spotlight} onChange={setSpotlight} onReset={onReset} />
    </div>
  );
}

function InsightCard({
  label,
  value,
  note,
  step,
}: {
  label: string;
  value: string;
  note: string;
  step: number;
}) {
  return (
    <div className="v-card v-reveal p-5" style={{ ["--step" as string]: step }}>
      <p className="v-label">{label}</p>
      <p className="v-nums mt-2 font-mono text-lead text-ink">{value}</p>
      <p className="mt-1 truncate text-micro text-ink-muted" title={note}>
        {note}
      </p>
    </div>
  );
}

/**
 * Temporary control proving the spotlight plumbing end to end. ElevenLabs will
 * drive `spotlight` from the narration track; until then this is how you see it.
 */
function PresentationPreview({
  spotlight,
  onChange,
  onReset,
}: {
  spotlight: SpotlightTarget;
  onChange: (target: SpotlightTarget) => void;
  onReset: () => void;
}) {
  const targets: { id: SpotlightTarget; label: string }[] = [
    { id: null, label: "Off" },
    { id: SPOT.headline, label: "Number" },
    { id: SPOT.chart, label: "Chart" },
    { id: SPOT.insights, label: "Insights" },
    { id: SPOT.source, label: "Source" },
  ];

  return (
    <div className="mt-14 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-6">
      <span className="v-label">Presentation mode</span>
      <div className="flex flex-wrap gap-1">
        {targets.map((target) => (
          <button
            key={target.label}
            type="button"
            onClick={() => onChange(target.id)}
            aria-pressed={spotlight === target.id}
            className={cn(
              "rounded-full px-3 py-1.5 text-micro transition-colors duration-150",
              spotlight === target.id
                ? "bg-ink text-bg"
                : "text-ink-muted hover:bg-sunk hover:text-ink",
            )}
          >
            {target.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="ml-auto rounded-full border border-line px-4 py-1.5 text-micro text-ink transition-colors duration-150 hover:bg-sunk"
      >
        Ask another question
      </button>
    </div>
  );
}

/**
 * The unverified state. It carries NO number — the `Finding` union has no
 * `value` on this branch, so there is nothing here that could leak one. It has
 * to look deliberate, not broken (DESIGN.md v3 "Honesty").
 */
function UnverifiedFinding({
  question,
  finding,
  onReset,
}: {
  question: string;
  finding: Extract<Finding, { verdict: "unverified" }>;
  onReset: () => void;
}) {
  const isQuestionRefusal = finding.reason === "question_not_answerable";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pt-4 pb-24">
      <p className="v-reveal text-small text-ink-muted" style={{ ["--step" as string]: 0 }}>
        {question}
      </p>

      <div className="v-reveal-slow mt-6" style={{ ["--step" as string]: 1 }}>
        <p className="inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn-wash px-3 py-1.5 text-micro text-ink">
          <ShieldAlert className="size-3.5 text-warn" aria-hidden />
          {isQuestionRefusal
            ? "Not answerable from this file — no number released"
            : "Unverified — no number released"}
        </p>
        <h1 className="mt-6 text-title font-medium text-balance text-ink">
          {BLOCK_REASON_COPY[finding.reason]}
        </h1>
        <p className="mt-4 max-w-[62ch] text-body text-ink-muted">
          {isQuestionRefusal
            ? finding.detail
            : "Vera will not state a figure she cannot trace back to executed code and real cells. The run is shown below exactly as it happened."}
        </p>
        {isQuestionRefusal && (
          <p className="mt-4 max-w-[62ch] text-body text-ink-muted">
            Try asking for a total, average, count, comparison, or trend that can be calculated from
            this file.
          </p>
        )}
      </div>

      {!isQuestionRefusal && (
        <div className="v-reveal mt-8 border-b border-line" style={{ ["--step" as string]: 2 }}>
          <Disclosure label="What went wrong" meta={`${finding.attempts} attempts`}>
            <p className="rounded-xl border border-line bg-sunk p-4 font-mono text-micro leading-[1.7] text-ink">
              {finding.detail}
            </p>
          </Disclosure>
          {finding.code && (
            <Disclosure label="The code Vera attempted" meta={`${finding.code.lineCount} lines`}>
              <CodeBlock source={finding.code.source} />
            </Disclosure>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="v-reveal mt-8 rounded-full border border-line px-4 py-2 text-small text-ink transition-colors duration-150 hover:bg-sunk"
        style={{ ["--step" as string]: 3 }}
      >
        Ask another question
      </button>
    </div>
  );
}
