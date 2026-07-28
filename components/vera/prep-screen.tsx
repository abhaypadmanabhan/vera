"use client";

import type { ReactNode } from "react";
import type { PrepReport } from "@/lib/prepare/run";
import type { StageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Disclosure } from "./disclosure";
import { formatCount } from "./format";
import { StageMarker } from "./home-stage-marker";

/**
 * What Vera does to an uploaded file before she will answer a question about
 * it: four stages driven by real `prep-stage` events, then what she tidied, in
 * plain English, and "Ready — ask me anything."
 *
 * This panel never blocks the ask box. Prep can fail entirely and the reader
 * can still ask — Vera then works from the file as it came.
 */

export type PrepStageId = "profiling" | "cleaning" | "checking" | "ready";

export interface PrepStageMessage {
  stage: PrepStageId;
  status: StageStatus;
  detail: string;
}

export interface PrepStageView {
  id: PrepStageId;
  label: string;
  status: StageStatus;
  detail: string;
}

export const PREP_STAGE_ORDER: readonly PrepStageId[] = [
  "profiling",
  "cleaning",
  "checking",
  "ready",
];

export const PREP_STAGE_LABELS: Record<PrepStageId, string> = {
  profiling: "Profiling",
  cleaning: "Cleaning",
  checking: "Checking",
  ready: "Ready",
};

/**
 * Code jargon is barred from every presentation surface (CLAUDE.md). A detail
 * line comes off a route that may be quoting a Python failure, so anything
 * carrying a traceback, a library name, a path or a snake_case identifier is
 * dropped rather than cleaned up — a half-scrubbed traceback is still jargon.
 */
const JARGON = [
  /traceback/i,
  /\b(pandas|numpy|dataframe|pd|np|df)\b/i,
  /\b\w*(?:Error|Exception)\b/,
  /\b(dtype|NaN|read_csv|to_csv|astype|errors=)/i,
  /[a-z]+_[a-z_]+/i,
  /\/\w/,
  /[[\]{}()<>]/,
];

export function plainDetail(detail: string): string {
  const text = detail.trim();
  if (!text) return "";
  return JARGON.some((pattern) => pattern.test(text)) ? "" : text;
}

/**
 * Folds the stream into all four stages at once, so the sequence is on screen
 * from the first event and each stage settles in place instead of popping in.
 * The last message for a stage wins.
 */
export function stagesFrom(messages: readonly PrepStageMessage[]): PrepStageView[] {
  return PREP_STAGE_ORDER.map((id) => {
    let latest: PrepStageMessage | undefined;
    for (const message of messages) {
      if (message.stage === id) latest = message;
    }
    return {
      id,
      label: PREP_STAGE_LABELS[id],
      status: latest?.status ?? ("pending" as StageStatus),
      detail: plainDetail(latest?.detail ?? ""),
    };
  });
}

/**
 * The chips for an uploaded file are exactly the questions the route returned —
 * it already filtered them through the guardrail, so every one is answerable.
 * A failed prep offers none rather than offering a question about another file.
 */
export function chipsFor(report: PrepReport | null): string[] {
  return report?.ok ? report.questions : [];
}

/**
 * Prep never gates the ask box. Failed, running, or absent: she can still be
 * asked. The report is a parameter so this reads as a decision about it rather
 * than a constant someone will later "optimise" into an early return.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canAsk(report: PrepReport | null): boolean {
  return true;
}

export function PrepScreen({
  filename,
  messages,
  report,
  error,
}: {
  filename: string;
  messages: readonly PrepStageMessage[];
  report: PrepReport | null;
  /** A request that never became a stream: a rejected file, a rate limit, a dropped connection. */
  error: string | null;
}) {
  if (error) {
    return (
      <Panel label="Not prepared" filename={filename}>
        <p className="mt-2 text-small text-ink-muted">{plainDetail(error) || FALLBACK_ERROR}</p>
        <p className="mt-1 text-small text-ink-muted">{STILL_ASKABLE}</p>
      </Panel>
    );
  }

  if (report) {
    return <ReadyPanel filename={filename} report={report} />;
  }

  return <StagesPanel filename={filename} messages={messages} />;
}

const FALLBACK_ERROR = "Vera could not read that file.";
const STILL_ASKABLE = "You can still ask about the file on record.";

/**
 * Prep sits above the file on record, in the same column, because it is about a
 * file — not a modal and not a blocker. It ends in a hairline so the file
 * already on record reads as the thing still being answered about.
 */
function Panel({
  label,
  filename,
  className,
  children,
}: {
  label: string;
  /** Named only while it is not yet the file on record — the block below names that one. */
  filename?: string;
  /** Only for the bottom padding: a panel ending in a disclosure supplies its own. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="File preparation"
      className={cn("v-reveal mb-8 border-b border-line pb-7", className)}
      style={{ ["--step" as string]: 0 }}
    >
      <p className="v-label">{label}</p>
      {filename && (
        <p className="mt-1 font-mono text-small break-words text-ink">{filename}</p>
      )}
      {children}
    </section>
  );
}

function StagesPanel({
  filename,
  messages,
}: {
  filename: string;
  messages: readonly PrepStageMessage[];
}) {
  const stages = stagesFrom(messages);
  const active = stages.find((stage) => stage.status === "active");

  return (
    <Panel label="Preparing" filename={filename}>
      <ol className="mt-4">
        {stages.map((stage, index) => (
          <StageRow key={stage.id} stage={stage} isLast={index === stages.length - 1} />
        ))}
      </ol>
      <p aria-live="polite" className="sr-only">
        {active ? `${active.label}. ${active.detail}` : ""}
      </p>
    </Panel>
  );
}

/**
 * Same reserved geometry as the run timeline: the detail slot is one line tall
 * whether or not the stage has said anything yet, so the four stages hold their
 * positions as the stream fills them in.
 */
function StageRow({ stage, isLast }: { stage: PrepStageView; isLast: boolean }) {
  const pending = stage.status === "pending";

  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
      <div className="relative flex justify-center pt-0.5">
        <StageMarker status={stage.status} compact />
        {!isLast && (
          <span
            aria-hidden
            className={cn(
              "absolute top-[18px] -bottom-1 w-px",
              stage.status === "complete" ? "bg-line-strong" : "bg-line",
            )}
            style={{ left: "calc(50% - 0.5px)" }}
          />
        )}
      </div>
      <div className="pb-4">
        {/*
         * Recedes by weight and colour, never by opacity — see working-screen.tsx,
         * which also explains why these two are template literals and not `cn()`.
         */}
        <p
          className={`text-small ${stage.status === "active" ? "font-medium " : ""}${
            pending ? "text-ink-muted" : "text-ink"
          }`}
        >
          {stage.label}
        </p>
        <p
          className={`mt-0.5 min-h-[1.375rem] text-small ${
            stage.status === "failed" ? "text-danger" : "text-ink-muted"
          }`}
        >
          {stage.detail}
        </p>
      </div>
    </li>
  );
}

function ReadyPanel({ filename, report }: { filename: string; report: PrepReport }) {
  /**
   * A prep that failed open is a decision, not a breakage: she read the file as
   * it came and will answer from it. So it reads like every other state here —
   * same panel, same rules, plain ink — and it says what she will do next.
   */
  if (!report.ok) {
    return (
      <Panel label="Prepared as it came" filename={filename}>
        <p className="mt-3 text-small text-ink-muted">
          {plainDetail(report.detail ?? "") || FALLBACK_ERROR}
        </p>
        <p className="mt-2 text-small text-ink">
          Ask anyway — she will work from the file as you sent it.
        </p>
      </Panel>
    );
  }

  const counts = report.counts;
  const measured: { label: string; value: string }[] = counts
    ? [
        { label: "Rows in", value: formatCount(counts.rowsBefore) },
        { label: "Rows out", value: formatCount(counts.rowsAfter) },
        { label: "Exact duplicates removed", value: formatCount(counts.duplicatesDropped) },
        { label: "Values cleaned", value: formatCount(counts.cellsCoerced) },
      ]
    : [];

  /*
   * One line, then a disclosure — the same idiom the file on record uses below.
   * A finished prep used to unroll every fix and a four-row before/after table
   * on top of a panel that was already too loud; what she changed is worth
   * reading, not worth reading first.
   *
   * The file on record below already names the file — saying it twice reads as
   * a bug.
   */
  return (
    <Panel label="Prepared" className="pb-0">
      <p className="mt-3 text-body font-medium text-ink">Ready — ask me anything.</p>

      <Disclosure
        // Only a rule above: the panel's own closing rule already sits below,
        // and two parallel hairlines read as an empty row.
        className="mt-4"
        label="What she changed"
        meta={report.fixes.length > 0 ? formatCount(report.fixes.length) : undefined}
      >
        {report.fixes.length > 0 && (
          <ul className="grid gap-1.5">
            {report.fixes.map((fix) => (
              <li key={fix} className="flex gap-2 text-small text-ink-muted">
                <span aria-hidden className="shrink-0 text-line-strong">
                  —
                </span>
                <span>{fix}</span>
              </li>
            ))}
          </ul>
        )}

        {measured.length > 0 ? (
          <dl className={report.fixes.length > 0 ? "mt-4" : undefined}>
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
        ) : (
          <p className="mt-4 text-small text-ink-muted">
            She could not measure the before and after on this file.
          </p>
        )}
      </Disclosure>

      <p aria-live="polite" className="sr-only">
        Ready — ask me anything.
      </p>
    </Panel>
  );
}
