"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComparisonChart, type ComparisonBar } from "./comparison-chart";
import { Wordmark } from "./chrome";
import { ThemeToggle } from "./theme-toggle";

/**
 * The cold open.
 *
 * Scripted and deterministic: no fetch, no timer-driven data, no dependency on
 * the pipeline. It cannot fail on stage, and it plays identically every time.
 *
 * Every figure below is RECORDED, not invented (tasks/checkpoints.md CP-3 and
 * eval/questions.json): Q3 2018 sales are $143,787.36 when `OrderDate` is parsed
 * with the format proven from the data, and $50,517.26 when it is parsed
 * month-first — which silently drops 5,952 of the file's 9,994 rows. The
 * `OrderDate` values quoted are real cells from `data/superstore.csv`.
 *
 * The naive figure is labelled as exactly what it is. Nothing here claims Vera
 * can catch a subtly-wrong-but-runnable answer live (PRD §6).
 */

const QUESTION = "What were total sales in Q3 2018?";

const NAIVE = { value: 50_517.26, display: "$50,517.26" };
const VERA = { value: 143_787.36, display: "$143,787.36" };

const ROWS_TOTAL = 9_994;
const ROWS_DROPPED = 5_952;

/** Real cells from the file — first component above 12, so it cannot be a month. */
const REAL_DATES = ["15/04/2019", "22/11/2017", "13/05/2016", "27/08/2016"];

const BARS: ComparisonBar[] = [
  { label: "A typical AI", value: NAIVE.value, display: NAIVE.display, tone: "danger" },
  { label: "Vera", value: VERA.value, display: VERA.display, tone: "accent" },
];

/** ms each beat holds before the next one lands. Last beat holds forever. */
const BEAT_MS = [2600, 3600, 3800, 3400, 4600];
const LAST_BEAT = BEAT_MS.length;

export function ColdOpen() {
  const [beat, setBeat] = useState(0);
  const [auto, setAuto] = useState(true);

  const next = useCallback(() => {
    setAuto(false);
    setBeat((current) => Math.min(current + 1, LAST_BEAT));
  }, []);

  const back = useCallback(() => {
    setAuto(false);
    setBeat((current) => Math.max(current - 1, 0));
  }, []);

  const restart = useCallback(() => {
    setBeat(0);
    setAuto(true);
  }, []);

  useEffect(() => {
    if (!auto || beat >= LAST_BEAT) return;
    const id = window.setTimeout(() => setBeat((current) => current + 1), BEAT_MS[beat]);
    return () => window.clearTimeout(id);
  }, [auto, beat]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, next, restart]);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4 px-[5.4vw] py-5">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="v-label">Cold open</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href="/"
            className="rounded-full px-3 py-1.5 text-micro text-ink-muted transition-colors duration-150 hover:bg-sunk hover:text-ink"
          >
            Ask Vera
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col justify-center px-[5.4vw] pb-10">
        <div className="text-center">
          <p className="v-label">One question, two answers</p>
          <h1 className="mt-3 text-title font-medium text-balance text-ink">{QUESTION}</h1>
        </div>

        {/*
          The two panels and the punchline chart never share the screen: the
          chart IS the side-by-side, on one scale, and holding both would push
          the sequence off a 1280x800 display. Swapping them is the last beat.
        */}
        <div className={cn("mt-8 grid gap-6 md:grid-cols-2", beat >= LAST_BEAT && "hidden")}>
          <Panel
            shown={beat >= 1}
            tone="danger"
            title="A typical AI"
            subtitle="Answers from a sample of the file. Never runs the numbers."
            figure={NAIVE.display}
            quote={`“Total sales in Q3 2018 were ${NAIVE.display}.”`}
          >
            <Note shown={beat >= 2} tone="danger" icon={<TriangleAlert className="size-3.5" aria-hidden />}>
              It parsed the dates month-first and silently dropped{" "}
              <span className="v-nums font-mono">{ROWS_DROPPED.toLocaleString("en-US")}</span> of{" "}
              <span className="v-nums font-mono">{ROWS_TOTAL.toLocaleString("en-US")}</span> rows —
              60% of the file. It never said so.
            </Note>
          </Panel>

          <Panel
            shown={beat >= 3}
            tone="accent"
            title="Vera"
            subtitle="Writes the analysis, runs it in a sandbox, traces the result."
            figure={VERA.display}
            quote="“Total sales in Q3 2018 were $143,787.36.”"
          >
            <Note shown={beat >= 3} tone="accent" icon={<Check className="size-3.5" strokeWidth={3} aria-hidden />}>
              Computed by code that ran on the file, and traced back to real cells.
            </Note>
            <div
              aria-hidden={beat < 4}
              className={cn(
                "mt-4 rounded-xl border border-line bg-sunk p-4 transition-[opacity,transform] duration-[420ms] [transition-timing-function:var(--ease-settle)]",
                beat >= 4 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              )}
            >
              <p className="text-small font-medium text-ink">OrderDate is DD/MM/YYYY</p>
              <p className="mt-1 text-small text-ink-muted">
                <span className="v-nums font-mono text-ink">
                  {ROWS_DROPPED.toLocaleString("en-US")}
                </span>{" "}
                values have a first component above 12, which cannot be a month.{" "}
                <span className="v-nums font-mono text-ink">0</span> argue otherwise.
              </p>
              <p className="mt-2 font-mono text-micro text-ink-muted">
                {REAL_DATES.join("   ·   ")}
              </p>
            </div>
          </Panel>
        </div>

        {beat >= LAST_BEAT && (
          <div className="v-reveal-slow mx-auto mt-6 w-full max-w-2xl">
            <ComparisonChart
              bars={BARS}
              caption="Q3 2018 sales from superstore.csv — the same 9,994-row file, answered two ways."
            />
            <p className="mt-6 text-center text-lead font-medium text-balance text-ink">
              Same file. Same question. One of them ran the code.
            </p>
            <p className="mt-3 text-center text-small text-ink-muted">
              <span className="font-mono text-ink">OrderDate</span> is DD/MM/YYYY —{" "}
              <span className="v-nums font-mono text-ink">
                {ROWS_DROPPED.toLocaleString("en-US")}
              </span>{" "}
              rows prove it, <span className="v-nums font-mono text-ink">0</span> argue otherwise.
            </p>
          </div>
        )}
      </div>

      <footer className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-4 px-[5.4vw] py-6">
        <p className="max-w-[68ch] text-micro text-ink-muted">
          Scripted replay. Both figures are recorded results computed from the real file — the
          left-hand one is what a month-first date parse actually returns.
        </p>
        <div className="flex items-center gap-1">
          <Control onClick={back} disabled={beat === 0}>
            Back
          </Control>
          <Control onClick={next} disabled={beat === LAST_BEAT}>
            Next
          </Control>
          <Control onClick={restart}>Restart</Control>
          <span className="v-label ml-2">Space · ← → · R</span>
        </div>
      </footer>
    </main>
  );
}

function Panel({
  shown,
  tone,
  title,
  subtitle,
  figure,
  quote,
  children,
}: {
  shown: boolean;
  tone: "accent" | "danger";
  title: string;
  subtitle: string;
  figure: string;
  quote: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-hidden={!shown}
      className={cn(
        "v-card flex min-h-[17rem] flex-col p-7 transition-[opacity,transform] duration-[520ms] [transition-timing-function:var(--ease-settle)]",
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
    >
      <p className="flex items-center gap-2 text-body font-medium text-ink">
        <span
          aria-hidden
          className={cn("size-2 rounded-full", tone === "danger" ? "bg-danger" : "bg-accent")}
        />
        {title}
      </p>
      <p className="mt-1 text-small text-ink-muted">{subtitle}</p>

      <p
        className="v-nums mt-5 font-mono font-normal tracking-[-0.03em] text-ink"
        style={{ fontSize: "clamp(2.25rem, 4.2vw, 4rem)", lineHeight: 1 }}
      >
        {figure}
      </p>
      <p className="mt-4 text-small text-ink-muted">{quote}</p>

      <div className="mt-auto pt-5">{children}</div>
    </section>
  );
}

function Note({
  shown,
  tone,
  icon,
  children,
}: {
  shown: boolean;
  tone: "accent" | "danger";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p
      aria-hidden={!shown}
      className={cn(
        "flex items-start gap-2.5 text-small transition-[opacity,transform] duration-[420ms] [transition-timing-function:var(--ease-settle)]",
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <span className={cn("mt-0.5 shrink-0", tone === "danger" ? "text-danger" : "text-accent")}>
        {icon}
      </span>
      <span className="text-ink">{children}</span>
    </p>
  );
}

function Control({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 py-1.5 text-micro text-ink-muted transition-colors duration-150 hover:bg-sunk hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
    >
      {children}
    </button>
  );
}
