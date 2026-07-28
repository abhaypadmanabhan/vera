/*
 * The proof strip: one hairline-bounded band directly under the hero, carrying
 * one line of content and the four marks.
 *
 * HONESTY (PRD §6): this is the *aggregate, measured* claim, and the sentence
 * says which test it came from. The per-answer claim is a different one and
 * lives in the hero panel above. Both figures are read from eval/results.json
 * at build time.
 */
import { Reveal, Section } from "./primitives";
import { SponsorMarks } from "./sponsors";
import type { BenchmarkFacts } from "./the-proof";

export function ProofStrip({ facts }: { facts: BenchmarkFacts }) {
  return (
    <Section wide className="border-y border-line py-6">
      <Reveal step={3}>
        <div className="flex flex-wrap items-center justify-between gap-x-12 gap-y-6">
          <p className="max-w-[46ch] text-small text-ink-muted">
            <span className="v-nums font-medium text-ink">{facts.veraPercent}%</span> on a fixed{" "}
            <span className="v-nums">{facts.questionCount}</span>-question test. The same model,
            reading the file instead of calculating on it:{" "}
            <span className="v-nums font-medium text-ink">{facts.baselinePercent}%</span>.
          </p>
          <SponsorMarks />
        </div>
      </Reveal>
    </Section>
  );
}
