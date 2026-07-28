/*
 * Hero.
 *
 * One sentence, one line under it, one action — then the demonstration. The
 * argument is not "here is a program"; it is "watch her get to a number you can
 * check". The program is behind a click inside the panel, for whoever wants it.
 *
 * Copy is deliberately short. The builder's note: more words isn't better.
 */
import { Cta, Section } from "./primitives";
import { ProofSequence } from "./proof-sequence";
import { Reveal } from "./reveal";

export function Hero() {
  return (
    <Section as="header" wide className="pt-8 pb-14 sm:pt-10 sm:pb-20">
      {/*
        Headline and the ask sit side by side so the demonstration below them
        starts high enough to be seen without scrolling. Stacked, the panel
        began below the fold and the page read as static again.
      */}
      <div className="grid items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Reveal>
          <h1 className="v-display max-w-[14ch] text-[clamp(2.25rem,4.6vw,3.75rem)]">
            She proves every number before she says it.
          </h1>
        </Reveal>

        <Reveal step={1}>
          <p className="max-w-[38ch] text-body text-ink-muted">
            Ask a question about your spreadsheet. Vera works the answer out in front of you, and
            shows you where it came from.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Cta href="/ask">Ask her something</Cta>
            <Cta href="/open" tone="secondary">
              Watch the cold open
            </Cta>
          </div>
        </Reveal>
      </div>

      <Reveal step={2} className="mt-10 sm:mt-12">
        <ProofSequence />
      </Reveal>
    </Section>
  );
}
