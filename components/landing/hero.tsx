/*
 * Hero. This is a presentation surface — the builder narrates it in front of
 * judges — so it is type, air, and one action. Nothing decorative.
 *
 * The thesis is the sentence itself, set as large as the viewport allows, with
 * the operative clause carried in the one accent.
 */
import { Reveal, SpeakToVera } from "./primitives";

export function Hero({ questionCount }: { questionCount: number }) {
  return (
    <header className="flex min-h-[92svh] flex-col justify-between px-6 py-12 sm:px-10 sm:py-16">
      <Reveal>
        <div className="flex items-baseline gap-4">
          <p className="text-lead font-medium tracking-[-0.02em]">Vera</p>
          <span aria-hidden className="h-px flex-1 bg-line" />
          <p className="v-label">superstore.csv &middot; 9,994 rows</p>
        </div>
      </Reveal>

      <div className="mx-auto w-full max-w-[68rem] py-10">
        <Reveal step={1}>
          <h1 className="max-w-[19ch] text-[clamp(2.25rem,5.6vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.035em]">
            An AI business analyst that{" "}
            <span className="text-accent">proves every number</span> before she says it.
          </h1>
        </Reveal>

        <Reveal step={2}>
          <p className="mt-8 max-w-[52ch] text-[clamp(1.0625rem,1.7vw,1.375rem)] leading-[1.45] text-ink-muted">
            She writes the analysis code, runs it in an isolated sandbox, and files the code and the
            exact cells it read next to the figure. No traceable source, no number.
          </p>
        </Reveal>

        <Reveal step={3}>
          <div className="mt-10">
            <SpeakToVera />
          </div>
        </Reveal>
      </div>

      <Reveal step={4}>
        <dl className="grid gap-x-12 gap-y-8 border-t border-line pt-8 sm:grid-cols-3">
          <div>
            <dt className="v-label">Live claim</dt>
            <dd className="mt-2 text-body text-ink-muted">Computed, and traceable to source cells</dd>
          </div>
          <div>
            <dt className="v-label">Benchmark</dt>
            <dd className="mt-2 text-body text-ink-muted">
              <span className="v-nums font-mono">{questionCount}</span> questions, scored offline
            </dd>
          </div>
          <div>
            <dt className="v-label">When she cannot trace it</dt>
            <dd className="mt-2 text-body text-ink-muted">She shows no number</dd>
          </div>
        </dl>
      </Reveal>
    </header>
  );
}
