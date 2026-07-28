"use client";

import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "@/components/vera/use-reduced-motion";
import { CheckMark } from "./primitives";
import { FILE, QUESTION, VERIFIED, DAY_FIRST, CODE } from "./recorded";
import { VerifiedRun } from "./verified-run";

/*
 * The hero artifact — what Vera DOES, played out, for someone who has never
 * written a line of code.
 *
 * The previous hero put a pandas program on the fold. That is the right proof
 * for an engineer and the wrong one for the person this is actually built for:
 * a founder or an ops lead looking at a spreadsheet they cannot trust. They do
 * not know what `pd.to_datetime` is, and nothing on the page told them why it
 * was there.
 *
 * So the fold now shows the FLOW in plain English — she reads the file, works
 * out the answer, runs it somewhere sealed, checks it against the real cells —
 * and the number lands at the end of it. The program and the cells are still
 * one click away, for the reader who wants them. Nobody is asked to read code
 * to understand the argument.
 *
 * Honesty (PRD §6): this is a RECORDED run and says so in its own header. The
 * pacing is presentational; every figure in it is real and comes from
 * `./recorded`, which documents where each one was derived. Nothing here claims
 * to be executing while you look at it, and no request-time call is made.
 *
 * The figure never counts up. Animating a real number would undercut the entire
 * product — it settles in, at its true value, once.
 */

interface Step {
  label: string;
  detail: string;
}

const STEPS: readonly Step[] = [
  { label: "Reads your file", detail: `${FILE.rows.toLocaleString("en-US")} rows` },
  { label: "Works out the answer", detail: `${CODE.length} lines of code` },
  { label: "Runs it, sealed off", detail: VERIFIED.durationLabel },
  {
    label: "Checks it against the real cells",
    detail: `${DAY_FIRST.supporting.toLocaleString("en-US")} agree · ${DAY_FIRST.contradicting} disagree`,
  },
];

/** One beat per step, then a beat before the figure lands. */
const BEAT_MS = 620;
const DONE = STEPS.length + 1;

export function ProofSequence() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [working, setWorking] = useState(false);

  /*
   * Reduced motion gets the finished state, DERIVED rather than assigned — the
   * sequence explains the flow, it is never the only way to read it. Deriving
   * also keeps the effect free of a synchronous setState.
   */
  const progress = reduced ? DONE : tick;

  useEffect(() => {
    if (reduced || tick >= DONE) return;
    const id = window.setTimeout(() => setTick((current) => current + 1), BEAT_MS);
    return () => window.clearTimeout(id);
  }, [tick, reduced]);

  const replay = useCallback(() => setTick(0), []);

  const settled = progress >= DONE;
  const railScale = Math.min(progress / STEPS.length, 1);

  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line bg-sunk px-6 py-3 sm:px-8">
        <span className="font-mono text-micro text-ink-muted">
          {FILE.name} &middot; {FILE.rows.toLocaleString("en-US")} rows
        </span>
        <span className="font-mono text-micro text-ink-muted">A recorded run</span>
      </figcaption>

      <div className="grid gap-x-16 gap-y-10 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-center">
        <div>
          <p className="v-display text-[clamp(1.25rem,2vw,1.625rem)] text-ink">
            &ldquo;{QUESTION}&rdquo;
          </p>

          {/*
            The rail is the flow. One hairline down the left of the four steps,
            with the accent travelling down it as each one completes — transform
            only, so it costs nothing and survives reduced motion by simply
            arriving at the end.
          */}
          <ol className="relative mt-7 space-y-4 pl-8">
            <span
              aria-hidden
              className="absolute top-[0.55rem] bottom-[0.55rem] left-[0.4375rem] w-px bg-line"
            />
            <span
              aria-hidden
              className="absolute top-[0.55rem] bottom-[0.55rem] left-[0.4375rem] w-px origin-top bg-accent transition-transform duration-[620ms] ease-settle"
              style={{ transform: `scaleY(${railScale})` }}
            />

            {STEPS.map((stepItem, index) => {
              const state =
                progress > index + 1 ? "done" : progress === index + 1 ? "active" : "waiting";
              return (
                <li
                  key={stepItem.label}
                  data-state={state}
                  className="relative flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 transition-opacity duration-[420ms] ease-settle data-[state=waiting]:opacity-35"
                >
                  <span
                    aria-hidden
                    className={`absolute top-[0.3rem] -left-8 grid size-[0.9375rem] place-items-center rounded-full border transition-colors duration-[260ms] ease-settle ${
                      state === "waiting"
                        ? "border-line bg-surface text-transparent"
                        : "border-accent bg-surface text-accent"
                    }`}
                  >
                    {state === "done" ? (
                      <CheckMark className="size-[0.6875rem]" />
                    ) : (
                      <span className="size-[0.3125rem] rounded-full bg-current" />
                    )}
                  </span>
                  <span className="text-body text-ink">{stepItem.label}</span>
                  <span className="v-nums font-mono text-micro text-ink-muted">
                    {stepItem.detail}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/*
          The answer. It fades and settles into place; the digits are never
          animated from another value — a figure that counts up is a figure the
          reader watched the product invent.
        */}
        <div
          className="border-t border-line pt-8 transition-opacity duration-[520ms] ease-settle lg:border-t-0 lg:border-l lg:pt-0 lg:pl-16"
          style={{ opacity: settled ? 1 : 0 }}
        >
          <p className="v-display v-nums whitespace-nowrap text-[clamp(2.25rem,4.4vw,3.25rem)] text-ink">
            {VERIFIED.figure}
          </p>
          <p className="mt-2 text-body text-ink">{VERIFIED.claim}</p>
          <p className="mt-4 flex items-start gap-2 text-small font-medium text-accent">
            <CheckMark className="mt-1 shrink-0" />
            Verified &mdash; traced back to the cells it came from
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-6 py-4 sm:px-8">
        <button
          type="button"
          onClick={() => setWorking((open) => !open)}
          aria-expanded={working}
          aria-controls="hero-working"
          className="text-small font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-ink"
        >
          {working ? "Hide her working" : "Show her working"}
        </button>
        <p className="text-small text-ink-muted">The code she ran, and the cells she read.</p>
        {!reduced && settled && (
          <button
            type="button"
            onClick={replay}
            className="ml-auto text-small text-ink-muted transition-colors duration-150 hover:text-ink"
          >
            Replay
          </button>
        )}
      </div>

      {working && (
        <div id="hero-working" className="border-t border-line">
          <VerifiedRun />
        </div>
      )}
    </figure>
  );
}
