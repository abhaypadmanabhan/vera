/*
 * The proof — the Braintrust benchmark, told to a non-technical reader.
 *
 * HONESTY (PRD §6, CLAUDE.md): this is *measured accuracy, aggregate* — a
 * pre-computed offline benchmark. It is NOT a per-answer guarantee, and the
 * copy below says so in plain words rather than hedged ones. Every figure is
 * read from eval/results.json at build time; none of it is written here by hand.
 *
 * No jargon on this page. "Baseline", "no-execution", "profiled schema" and
 * question IDs all belong on the code slide, not in front of a judge who has
 * never seen the repo.
 */
import { CountUp } from "./count-up";
import styles from "./landing.module.css";
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
    <Reveal step={step}>
      <div className="border-t border-line py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-lead font-medium">{label}</p>
            <p className="mt-1 text-small text-ink-muted">{sub}</p>
          </div>
          <p
            className={`v-nums font-mono text-[clamp(2.5rem,7vw,4.5rem)] leading-none tracking-[-0.03em] ${
              tone === "vera" ? "text-ink" : "text-ink-muted"
            }`}
          >
            <CountUp value={percent} decimals={Number.isInteger(percent) ? 0 : 1} />
          </p>
        </div>
        <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-sunk">
          {/*
            The fill grows to its real width once, on a delay matched to the
            block's own reveal. Width is the only thing that moves, and
            prefers-reduced-motion drops it straight to the final width.
          */}
          <div
            className={`${styles.bar} h-full rounded-full ${
              tone === "vera" ? "bg-accent" : "bg-line-strong"
            }`}
            style={{ "--percent": `${percent}%`, "--step": step } as React.CSSProperties}
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
          We marked her homework. Every answer, against a key.
        </h2>
        <p className="mt-6 max-w-[58ch] text-lead text-ink-muted">
          We wrote down {facts.questionCount}{" "}
          ordinary questions about this spreadsheet — what did we
          sell, what did we keep, which year was better — and worked out the true answer to each one
          in advance. Then we asked twice. Once the normal way, where the AI reads the file and
          answers. Once Vera&rsquo;s way, where she writes the calculation and runs it.
        </p>
      </Reveal>

      <div className="mt-16">
        <Bar
          label="Vera"
          sub="Writes the calculation and runs it on the file"
          percent={facts.veraPercent}
          tone="vera"
          step={1}
        />
        <Bar
          label="The same AI, reading instead of calculating"
          sub="Given the identical file and the identical questions"
          percent={facts.baselinePercent}
          tone="baseline"
          step={2}
        />
      </div>

      <Reveal step={3}>
        <div className="mt-16 grid gap-10 border-t border-line pt-12 md:grid-cols-2">
          <div>
            <p className="v-label">What the marking found</p>
            <p className="mt-5 max-w-[46ch] text-body text-ink-muted">
              Reading got the easy ones. It fell over on all{" "}
              <span className="v-nums font-mono text-ink">{facts.baselineMissCount}</span> questions
              that needed real arithmetic across the whole file — the totals, the margins, the
              discounts, and anything that depended on a date. Those are the questions a business
              actually asks.
            </p>
          </div>
          <div>
            <p className="v-label">What we did about it</p>
            <p className="mt-5 max-w-[46ch] text-body text-ink-muted">
              We stopped letting her answer from reading. Vera now calculates first and speaks
              second — and if the calculation does not run, she has nothing to say. That single rule
              is the whole difference between the two rows above.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal step={4}>
        <div className="mt-14 border-t border-line pt-8">
          <p className="max-w-[64ch] text-body text-ink-muted">
            Said plainly: this was a fixed test with a known answer key, scored once, before today.
            It is a track record, not a promise about every future answer. What Vera promises live
            is smaller and firmer — she will only show you a number that code actually produced from
            your file, and she will show you that code and those rows. When she cannot, she says so
            instead of guessing.
          </p>
          <a
            href={facts.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-body font-medium text-accent underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent"
          >
            See every question and answer, scored
            <span aria-hidden>&#8599;</span>
          </a>
        </div>
      </Reveal>
    </Section>
  );
}
