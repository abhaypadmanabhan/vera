import { readFile } from "node:fs/promises";
import path from "node:path";

import landing from "@/components/landing/landing.module.css";
import { HowSheWorks } from "@/components/landing/how-she-works";
import { Hero } from "@/components/landing/hero";
import { PoweredBy } from "@/components/landing/powered-by";
import { Reveal, Section, SpeakToVera } from "@/components/landing/primitives";
import { TheProof, type BenchmarkFacts } from "@/components/landing/the-proof";
import { ThreeAnswers } from "@/components/landing/three-answers";

/*
 * The narration surface, and the site root: the builder walks judges down this
 * page, then clicks "Speak to Vera" into the live demo at `/ask`.
 *
 * Every figure is either recorded and verified (the three answers) or read from
 * eval/results.json at build time (the benchmark). Nothing is invented, and no
 * external call happens at request time — the page renders with .env.local
 * absent.
 */

type ResultsFile = {
  dashboardUrl: string;
  questionCount: number;
  headline: { veraPercent: number; baselinePercent: number };
  baselineMisses: string[];
};

/** Reads the benchmark off disk at build time. eval/ is read-only to this page. */
async function readBenchmark(): Promise<BenchmarkFacts> {
  const raw = await readFile(path.join(process.cwd(), "eval", "results.json"), "utf8");
  const parsed = JSON.parse(raw) as ResultsFile;

  return {
    veraPercent: parsed.headline.veraPercent,
    baselinePercent: parsed.headline.baselinePercent,
    questionCount: parsed.questionCount,
    baselineMissCount: parsed.baselineMisses.length,
    dashboardUrl: parsed.dashboardUrl,
  };
}

export default async function WelcomePage() {
  const facts = await readBenchmark();

  return (
    <main className="mx-auto w-full">
      {/* Decorative only — behind everything, ignored by assistive tech. */}
      <div aria-hidden className={landing.backdrop}>
        <div className={`${landing.wash} ${landing.washOne}`} />
        <div className={`${landing.wash} ${landing.washTwo}`} />
      </div>

      <Hero questionCount={facts.questionCount} />
      <ThreeAnswers />
      <HowSheWorks />
      <TheProof facts={facts} />
      <PoweredBy />

      <Section className="text-center">
        <Reveal>
          <h2 className="mx-auto max-w-[18ch] text-[clamp(2.25rem,6.5vw,5rem)] font-medium leading-[1.02] tracking-[-0.03em]">
            Ask her something you can check.
          </h2>
          <p className="mx-auto mt-8 max-w-[46ch] text-lead text-ink-muted">
            She will show you the code she ran and the cells she read. That is the point.
          </p>
          <div className="mt-14">
            <SpeakToVera />
          </div>
        </Reveal>
      </Section>

      <footer className="border-t border-line px-6 py-10 sm:px-10">
        <div className="mx-auto flex w-full max-w-[68rem] flex-wrap items-center justify-between gap-4">
          <p className="v-label">Vera</p>
          <p className="v-label">Every number on this page is recorded, not estimated</p>
        </div>
      </footer>
    </main>
  );
}
