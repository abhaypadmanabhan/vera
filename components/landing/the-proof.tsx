/*
 * The proof — the Braintrust benchmark, told to a non-technical reader.
 *
 * HONESTY (PRD §6, CLAUDE.md): this is *measured accuracy, aggregate* — a
 * pre-computed offline benchmark. It is NOT a per-answer guarantee, and the
 * disclaimer at the bottom says so in plain words rather than hedged ones. It
 * must not be softened. Every figure is read from eval/results.json at build
 * time; none of it is written here by hand.
 *
 * Form: one shared measure with two tracks against a single axis, so the two
 * scores are read against each other rather than as two separate widgets.
 */
import styles from "./landing.module.css";
import { Reveal, Section } from "./primitives";

export type BenchmarkFacts = {
  veraPercent: number;
  baselinePercent: number;
  questionCount: number;
  baselineMissCount: number;
  dashboardUrl: string;
};

function Score({
  label,
  sub,
  percent,
  tone,
  step,
}: {
  label: string;
  sub: string;
  percent: number;
  tone: "vera" | "baseline";
  step: number;
}) {
  return (
    <Reveal step={step} className="pt-8 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
        <p className="text-body font-medium text-ink">{label}</p>
        <p
          className={`v-display v-nums text-[clamp(2.25rem,5vw,3.5rem)] ${
            tone === "vera" ? "text-ink" : "text-ink-muted"
          }`}
        >
          {percent}%
        </p>
      </div>
      <p className="text-small text-ink-muted">{sub}</p>
      <div className="mt-4 h-2 w-full overflow-hidden bg-sunk">
        <div
          className={`${styles.fill} h-full origin-left ${
            tone === "vera" ? "bg-accent" : "bg-line-strong"
          }`}
          style={{ "--fill": percent / 100, "--step": step } as React.CSSProperties}
        />
      </div>
    </Reveal>
  );
}

export function TheProof({ facts }: { facts: BenchmarkFacts }) {
  const veraCorrect = Math.round((facts.veraPercent / 100) * facts.questionCount);
  const baselineCorrect = facts.questionCount - facts.baselineMissCount;

  return (
    <Section className="pt-16 pb-12 sm:pt-24 sm:pb-16">
      <Reveal>
        <h2 className="v-display max-w-[22ch] text-[clamp(2rem,4.6vw,3.5rem)]">
          We marked her homework. Every answer, against a key.
        </h2>
        <p className="mt-6 max-w-[46ch] text-body text-ink-muted">
          {facts.questionCount}{" "}
          ordinary questions about this spreadsheet, with the true answer worked out in advance. Then we asked twice &mdash; once by reading the file, once by
          calculating on it.
        </p>
      </Reveal>

      <div className="mt-16 max-w-[46rem]">
        <Score
          label="Vera"
          sub={`Writes the calculation and runs it — ${veraCorrect} of ${facts.questionCount} right`}
          percent={facts.veraPercent}
          tone="vera"
          step={1}
        />
        <Score
          label="The same model, reading instead of calculating"
          sub={`Identical file, identical questions — ${baselineCorrect} of ${facts.questionCount} right`}
          percent={facts.baselinePercent}
          tone="baseline"
          step={2}
        />

        <Reveal step={3}>
          <div
            aria-hidden
            className="v-nums mt-3 flex justify-between border-t border-line pt-2 text-small text-ink-muted"
          >
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </Reveal>
      </div>

      <Reveal step={3}>
        <div className="mt-16 grid gap-x-16 gap-y-8 border-t border-line pt-12 md:grid-cols-2">
          <div>
            <p className="text-body font-medium text-ink">What the marking found</p>
            <p className="mt-3 max-w-[42ch] text-small text-ink-muted">
              Reading got the easy ones. It missed all{" "}
              <span className="v-nums">{facts.baselineMissCount}</span>{" "}
              that needed real arithmetic across the file &mdash; totals, margins, anything dated. The questions a business
              actually asks.
            </p>
          </div>
          <div>
            <p className="text-body font-medium text-ink">What we did about it</p>
            <p className="mt-3 max-w-[42ch] text-small text-ink-muted">
              Vera calculates first and speaks second. If the calculation does not run, she has
              nothing to say. That one rule is the whole difference above.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal step={4}>
        {/* bg-surface, not bg-sunk: the accent link on sunk measures 4.49:1, a hair under AA. */}
        <div className="mt-12 rounded-2xl border border-line bg-surface px-6 py-6 sm:px-8 sm:py-8">
          <p className="max-w-[58ch] text-small text-ink-muted">
            Plainly: a fixed test with a known answer key, scored once, before today. A track
            record &mdash; not a promise about every future answer. What Vera promises live is
            smaller and firmer: she shows you only a number that code produced from your file, and
            she shows you that code. When she cannot, she says so instead of guessing.
          </p>
          <a
            href={facts.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-small font-medium text-accent underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-accent"
          >
            See every question and answer, scored
            <span aria-hidden>&#8599;</span>
          </a>
        </div>
      </Reveal>
    </Section>
  );
}
