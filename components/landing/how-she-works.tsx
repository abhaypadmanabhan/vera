/*
 * How she works — four stages. This one genuinely IS a sequence (each stage
 * consumes the last one's output), so the mono step numbers are earned rather
 * than decorative.
 *
 * The closing line is bound by PRD §6: the live claim is exactly "computed, and
 * traceable". Nothing here may imply she catches a subtly-wrong-but-runnable
 * answer at question time.
 */
import { Reveal, Section } from "./primitives";

const STAGES = [
  {
    n: "01",
    title: "Profiles the file",
    body: "Reads the real columns, dtypes and date formats off the actual cells — not off the header row's promises.",
  },
  {
    n: "02",
    title: "Writes the pandas",
    body: "Generates analysis code against that profiled schema, so the parse matches the data that is actually there.",
  },
  {
    n: "03",
    title: "Runs it in an isolated sandbox",
    body: "The code executes for real on the real file, in a sandbox that cannot touch anything else. No estimate, no recollection.",
  },
  {
    n: "04",
    title: "Traces the number back to cells",
    body: "The figure is checked against the source rows it came from, and the code and those cells are filed beside it.",
  },
] as const;

export function HowSheWorks() {
  return (
    <Section eyebrow="How she works">
      <Reveal>
        <h2 className="max-w-[22ch] text-[clamp(2rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.02em]">
          She does not recall the number. She computes it.
        </h2>
      </Reveal>

      <ol className="mt-20 grid gap-px border border-line bg-line sm:grid-cols-2">
        {STAGES.map((stage, i) => (
          <Reveal key={stage.n} step={i + 1} className="bg-bg">
            <li className="h-full bg-bg p-8 sm:p-10">
              <p className="v-label text-accent">{stage.n}</p>
              <h3 className="mt-6 text-title font-medium leading-[1.15]">{stage.title}</h3>
              <p className="mt-4 max-w-[42ch] text-body text-ink-muted">{stage.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>

      <Reveal step={5}>
        <p className="mt-16 max-w-[56ch] text-[clamp(1.25rem,2.6vw,2rem)] font-medium leading-[1.25] tracking-[-0.02em]">
          If the number cannot be traced back to executed code and real cells,{" "}
          <span className="text-accent">she shows no number at all.</span>
        </p>
        <p className="mt-6 max-w-[62ch] text-body text-ink-muted">
          Not a hedge, not a lower-confidence guess — nothing. Refusing is the feature.
        </p>
      </Reveal>
    </Section>
  );
}
