/*
 * The signature section: one question, three answers, two of them wrong.
 *
 * Structure encodes the argument — the two wrong figures are struck and set in
 * the muted ink, the true one stands alone at full figure size. This is a
 * comparison, not a sequence, so there is no numbering.
 *
 * Every figure here is real and recorded (see PRD / the cold open in DESIGN.md).
 */
import { Reveal, Section } from "./primitives";

type Answer = {
  figure: string;
  label: string;
  detail: string;
  status: "wrong" | "true";
};

const ANSWERS: readonly Answer[] = [
  {
    figure: "$50,517",
    label: "A naive date parse",
    detail: "Silently drops 5,952 of 9,994 rows. Reads DD/MM as MM/DD and throws away what will not fit.",
    status: "wrong",
  },
  {
    figure: "$131,098",
    label: "The file's own Order Quarter column",
    detail: "Disagrees with the real order dates on 2,889 rows. The column is in the file, and the column is wrong.",
    status: "wrong",
  },
  {
    figure: "$143,787.36",
    label: "The truth",
    detail: "Parsed day-first, proven by 5,952 values whose first component exceeds 12 and cannot be a month — 0 arguing otherwise.",
    status: "true",
  },
];

export function ThreeAnswers() {
  return (
    <Section eyebrow="The problem, in one number">
      <Reveal>
        <h2 className="max-w-[24ch] text-[clamp(2rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.02em]">
          &ldquo;What were sales in Q3 2018?&rdquo;
        </h2>
        <p className="mt-6 max-w-[54ch] text-lead text-ink-muted">
          One question. One file. Three different answers, and only one of them is right. Two of
          these are what a confident assistant hands you without blinking.
        </p>
      </Reveal>

      <ol className="mt-20 space-y-0">
        {ANSWERS.map((answer, i) => (
          <Reveal key={answer.figure} step={i + 1}>
            <li
              className={`grid gap-x-12 gap-y-4 border-t border-line py-12 sm:grid-cols-[minmax(0,20rem)_1fr] ${
                answer.status === "true" ? "border-t-ink" : ""
              }`}
            >
              <div>
                <p
                  className={`v-nums whitespace-nowrap font-mono text-[clamp(1.875rem,4vw,2.75rem)] leading-none tracking-[-0.03em] ${
                    answer.status === "true"
                      ? "text-ink"
                      : "text-ink-muted line-through decoration-danger decoration-[2px]"
                  }`}
                >
                  {answer.figure}
                </p>
                <p
                  className={`v-label mt-4 ${
                    answer.status === "true" ? "text-accent" : "text-danger"
                  }`}
                >
                  {answer.status === "true" ? "Verified" : "Wrong"}
                </p>
              </div>
              <div className="max-w-[52ch] self-center">
                <p className="text-lead font-medium text-ink">{answer.label}</p>
                <p className="mt-2 text-body text-ink-muted">{answer.detail}</p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>

      <Reveal step={4}>
        <p className="mt-16 max-w-[60ch] border-l-2 border-accent pl-6 text-lead text-ink">
          Nothing on screen tells you which one you got. That is the whole problem — the wrong
          answers run perfectly well.
        </p>
      </Reveal>
    </Section>
  );
}
