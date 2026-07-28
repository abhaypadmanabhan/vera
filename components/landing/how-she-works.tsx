/*
 * How she works — four stages. This one genuinely IS a sequence: each stage
 * consumes the last one's output, so `.v-marker` numbering is earned here, and
 * only here on the page.
 *
 * Form: a two-column editorial spread — the claim holds still on the left while
 * the stages run past on the right. No cards; the rules do the separating.
 *
 * The closing line is bound by PRD §6. The live claim is exactly "computed, and
 * traceable". Nothing here may imply she catches a subtly-wrong-but-runnable
 * answer at question time.
 */
import { Reveal, Section } from "./primitives";

const STAGES = [
  {
    n: "01",
    title: "Profiles the file",
    body: "Reads the real columns and date formats off the cells, not off the header.",
  },
  {
    n: "02",
    title: "Writes the calculation",
    body: "Analysis code, written against what the file actually contains.",
  },
  {
    n: "03",
    title: "Runs it, sealed off",
    body: "It executes for real, on the real file, somewhere it cannot touch anything else.",
  },
  {
    n: "04",
    title: "Traces the number back",
    body: "The figure is checked against the rows it came from, and filed beside them.",
  },
] as const;

export function HowSheWorks() {
  return (
    <Section className="border-t border-line bg-sunk pt-12 pb-16 sm:pt-16 sm:pb-24">
      {/* Two columns only from lg: at 768 the left rail is too narrow to set a statement in. */}
      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <Reveal className="lg:sticky lg:top-16 lg:self-start">
          <h2 className="v-display max-w-[14ch] text-[clamp(2rem,4.2vw,3.25rem)]">
            She does not recall the number. She computes it.
          </h2>
          <p className="mt-6 max-w-[34ch] text-body text-ink-muted">
            Four stages, in order. The last one is allowed to say no.
          </p>

          {/* The refusal is the argument of this section, so it holds still beside the stages. */}
          <div className="mt-12 border-l-2 border-accent pl-6">
            <p className="v-display max-w-[24ch] text-[clamp(1.375rem,2.4vw,1.75rem)] text-ink">
              If the number cannot be traced back to executed code and real cells, she shows no
              number at all.
            </p>
            <p className="mt-3 max-w-[34ch] text-small text-ink-muted">
              Not a hedge, not a lower-confidence guess. Nothing.
            </p>
          </div>
        </Reveal>

        <ol className="border-t border-line">
          {STAGES.map((stage, i) => (
            <Reveal key={stage.n} step={i + 1}>
              <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-b border-line py-6">
                <p className="v-marker pt-1">{stage.n}</p>
                <div>
                  <h3 className="text-lead text-ink">{stage.title}</h3>
                  <p className="mt-2 max-w-[46ch] text-small text-ink-muted">{stage.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
