import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

import { HowSheWorks } from "@/components/landing/how-she-works";
import { Hero } from "@/components/landing/hero";
import { PoweredBy } from "@/components/landing/powered-by";
import { Cta, Reveal, Section } from "@/components/landing/primitives";
import { ProofStrip } from "@/components/landing/proof-strip";
import { TheProof, type BenchmarkFacts } from "@/components/landing/the-proof";
import { ThreeAnswers } from "@/components/landing/three-answers";
import { ThemeToggle } from "@/components/vera/theme-toggle";

/*
 * The narration surface, and the site root: the builder walks judges down this
 * page, then clicks "Speak to Vera" into the live demo at `/ask`.
 *
 * Every figure is either recorded and verified (the hero panel, the three
 * answers — see components/landing/recorded.ts) or read from eval/results.json
 * at build time (the benchmark). Nothing is invented, and no external call
 * happens at request time — the page renders with .env.local absent.
 *
 * The page background is `.v-field`, mounted globally in app/layout.tsx. This
 * file no longer paints one of its own.
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
      <Section as="header" wide className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <span className="text-body font-medium tracking-[-0.01em] text-ink">Vera</span>
          <nav aria-label="Site" className="flex items-center gap-1">
            <Link
              href="/open"
              className="rounded-full px-3 py-2 text-small text-ink-muted transition-colors duration-150 hover:bg-sunk hover:text-ink"
            >
              Cold open
            </Link>
            <Link
              href="/ask"
              className="rounded-full px-3 py-2 text-small text-ink-muted transition-colors duration-150 hover:bg-sunk hover:text-ink"
            >
              Ask
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </Section>

      <Hero />
      <ProofStrip facts={facts} />
      <ThreeAnswers />
      <HowSheWorks />
      <TheProof facts={facts} />
      <PoweredBy />

      <Section className="border-t border-line pt-16 pb-16 sm:pt-24 sm:pb-24">
        <Reveal>
          <h2 className="v-display max-w-[18ch] text-[clamp(2rem,4.6vw,3.5rem)]">
            Ask her something you can check.
          </h2>
          <div className="mt-12 flex flex-wrap items-end justify-between gap-x-16 gap-y-8">
            <p className="max-w-[38ch] text-body text-ink-muted">
              She will show you the code she ran and the cells she read. That is the point.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Cta href="/ask">Speak to Vera</Cta>
              <Cta href="/open" tone="secondary">
                Watch the cold open
              </Cta>
            </div>
          </div>
        </Reveal>
      </Section>

      <Section as="footer" className="border-t border-line py-8">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
          <p className="text-small text-ink-muted">Vera &mdash; the analyst who shows her work</p>
          <p className="text-small text-ink-muted">
            Every number on this page is recorded, not estimated
          </p>
        </div>
      </Section>
    </main>
  );
}
