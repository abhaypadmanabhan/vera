"use client";

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import type { PrepReport } from "@/lib/prepare/run";
import type { StageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatCount } from "./format";

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

function Panel({
  label,
  filename,
  children,
}: {
  label: string;
  /** Named only while it is not yet the file on record — the line below names that one. */
  filename?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="File preparation"
      className="v-reveal mt-8 border-t border-line pt-5"
      style={{ ["--step" as string]: 0 }}
    >
      <p className="v-label">
        {label}
        {filename && (
          <>
            {" · "}
            <span className="normal-case">{filename}</span>
          </>
        )}
      </p>
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

function StageRow({ stage, isLast }: { stage: PrepStageView; isLast: boolean }) {
  const pending = stage.status === "pending";

  return (
    <li className="grid grid-cols-[18px_1fr] gap-x-3">
      <div className="relative flex justify-center pt-[5px]">
        <Marker status={stage.status} />
        {!isLast && (
          <span
            aria-hidden
            className="absolute top-[17px] bottom-[-5px] w-px bg-line"
            style={{ left: "calc(50% - 0.5px)" }}
          />
        )}
      </div>
      <div className={cn("pb-4 transition-opacity duration-300", pending && "opacity-40")}>
        <p
          className={cn(
            "text-small text-ink transition-[font-weight] duration-150",
            stage.status === "active" ? "font-medium" : "font-normal",
          )}
        >
          {stage.label}
        </p>
        {stage.detail && (
          <p
            className={cn(
              "mt-0.5 text-micro",
              stage.status === "failed" ? "text-warn" : "text-ink-muted",
            )}
          >
            {stage.detail}
          </p>
        )}
      </div>
    </li>
  );
}

function Marker({ status }: { status: StageStatus }) {
  if (status === "complete") {
    return (
      <span className="grid size-4 place-items-center rounded-full bg-accent text-white">
        <Check className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="grid size-4 place-items-center rounded-full bg-warn text-white">
        <X className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="grid size-4 place-items-center">
        <span className="v-breathe size-2 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <span className="grid size-4 place-items-center">
      <span className="size-2 rounded-full border border-line-strong" />
    </span>
  );
}

function ReadyPanel({ filename, report }: { filename: string; report: PrepReport }) {
  if (!report.ok) {
    return (
      <Panel label="Prepared as it came" filename={filename}>
        <p className="mt-2 text-small text-ink-muted">{plainDetail(report.detail ?? "") || FALLBACK_ERROR}</p>
        <p className="mt-1 text-small text-ink-muted">Ask anyway — she will work from the file as you sent it.</p>
      </Panel>
    );
  }

  const counts = report.counts;

  return (
    <Panel label="Ready">
      <p className="mt-2 text-lead font-medium text-ink">Ready — ask me anything.</p>

      {report.fixes.length > 0 && (
        <ul className="mt-3 grid gap-1">
          {report.fixes.map((fix) => (
            <li key={fix} className="grid grid-cols-[18px_1fr] text-small text-ink-muted">
              <span aria-hidden className="text-line-strong">
                —
              </span>
              <span>{fix}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="v-nums mt-4 font-mono text-micro text-ink-muted">
        {counts ? (
          <>
            {formatCount(counts.rowsBefore)} rows in · {formatCount(counts.rowsAfter)} out ·{" "}
            {formatCount(counts.duplicatesDropped)} exact duplicates removed ·{" "}
            {formatCount(counts.cellsCoerced)} values cleaned
          </>
        ) : (
          "She could not measure the before and after on this file."
        )}
      </p>

      <p aria-live="polite" className="sr-only">
        Ready — ask me anything.
      </p>
    </Panel>
  );
}
