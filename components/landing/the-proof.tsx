/*
 * The proof — the Braintrust benchmark.
 *
 * HONESTY (PRD §6, CLAUDE.md): this is *measured accuracy, aggregate* — a
 * pre-computed offline benchmark. It is NOT a per-answer guarantee, and the
 * copy below says so in as many words. Every figure is read from
 * eval/results.json at build time; none of it is written here by hand.
 */
import { Reveal, Section } from "./primitives";

export type BenchmarkFacts = {
  veraPercent: number;
  baselinePercent: number;
  questionCount: number;
  baselineMissCount: number;
  dashboardUrl: string;
};

function Bar({
  label,
  percent,
  tone,
  step,
}: {
  label: string;
  percent: number;
  tone: "vera" | "baseline";
  step: number;
}) {
  return (
    <Reveal step={step}>
      <div className="border-t border-line py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-lead font-medium">{label}</p>
          <p
            className={`v-nums font-mono text-[clamp(2.5rem,7vw,4.5rem)] leading-none tracking-[-0.03em] ${
              tone === "vera" ? "text-ink" : "text-ink-muted"
            }`}
          >
            {percent}%
          </p>
        </div>
        <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-sunk">
          <div
            className={`h-full rounded-full ${tone === "vera" ? "bg-accent" : "bg-line-strong"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </Reveal>
  );
}

export function TheProof({ facts }: { facts: BenchmarkFacts }) {
  return (
    <Section eyebrow="The proof">
      <Reveal>
        <h2 className="max-w-[24ch] text-[clamp(2rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.02em]">
          Same {facts.questionCount} questions. Same context. One of them runs the code.
        </h2>
        <p className="mt-6 max-w-[58ch] text-lead text-ink-muted">
          A no-execution baseline was handed the identical profiled schema and the identical
          questions, and asked to answer from it. It missed {facts.baselineMissCount} of{" "}
          {facts.questionCount}.
        </p>
      </Reveal>

      <div className="mt-16">
        <Bar label="Vera — writes and executes the analysis" percent={facts.veraPercent} tone="vera" step={1} />
        <Bar label="Baseline — same context, no execution" percent={facts.baselinePercent} tone="baseline" step={2} />
      </div>

      <Reveal step={3}>
        <div className="mt-14 border-t border-line pt-8">
          <p className="max-w-[64ch] text-body text-ink-muted">
            This is a pre-computed offline benchmark — measured accuracy in aggregate, not a promise
            about any single live answer. Live, the claim is narrower and stricter: the number was
            computed by code that ran, and it traces back to real cells. Vera does not detect a
            subtly wrong but perfectly runnable answer on an arbitrary file.
          </p>
          <a
            href={facts.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-body font-medium text-accent underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent"
          >
            See the run on Braintrust
            <span aria-hidden>&#8599;</span>
          </a>
        </div>
      </Reveal>
    </Section>
  );
}
