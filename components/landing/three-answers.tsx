/*
 * The signature section: one question, three answers, two of them wrong.
 *
 * The argument is unchanged; only the form is. It is a comparison, not a
 * sequence, so nothing here is numbered. The two wrong figures sit in the open
 * on hairlines, struck and muted. The true one is the section's single
 * contained object, which is the whole point being made typographically: it is
 * the only one with something behind it.
 *
 * Every figure is real and recorded — see `./recorded` for provenance.
 */
import { ANSWERS, DAY_FIRST, FILE, QUESTION } from "./recorded";
import { CheckMark, Reveal, Section } from "./primitives";

const WRONG = ANSWERS.filter((answer) => answer.status === "wrong");
const TRUE_ANSWER = ANSWERS.find((answer) => answer.status === "true")!;

export function ThreeAnswers() {
  return (
    <Section className="pt-16 pb-12 sm:pt-24 sm:pb-16">
      <Reveal>
        <h2 className="v-display max-w-[20ch] text-[clamp(2rem,4.6vw,3.5rem)]">
          &ldquo;{QUESTION}&rdquo;
        </h2>
        <p className="mt-6 max-w-[46ch] text-body text-ink-muted">
          One question. One file. Three answers &mdash; and all three run without an error.
        </p>
      </Reveal>

      <div className="mt-16 border-t border-line">
        {WRONG.map((answer, i) => (
          <Reveal key={answer.figure} step={i + 1}>
            <div className="grid gap-x-12 gap-y-3 border-b border-line py-8 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-baseline">
              <p className="v-display v-nums text-[clamp(1.75rem,3.4vw,2.5rem)] text-ink-muted line-through decoration-danger decoration-2">
                {answer.figure}
              </p>
              <div className="max-w-[54ch]">
                <p className="text-body font-medium text-ink">{answer.label}</p>
                <p className="mt-2 text-small text-ink-muted">{answer.detail}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal step={3}>
        <div className="mt-12 rounded-2xl border border-line bg-surface px-6 py-8 shadow-lift sm:px-12 sm:py-12">
          <p className="flex items-start gap-2 text-small font-medium text-accent">
            <CheckMark className="mt-1 shrink-0" />
            The one that survives being checked
          </p>
          <div className="mt-6 grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-baseline">
            <p className="v-display v-nums whitespace-nowrap text-[clamp(2.5rem,5.6vw,3.75rem)] text-ink">
              {TRUE_ANSWER.figure}
            </p>
            <div className="max-w-[52ch]">
              <p className="text-body font-medium text-ink">{TRUE_ANSWER.label}</p>
              <p className="mt-2 text-small text-ink-muted">{TRUE_ANSWER.detail}</p>
            </div>
          </div>
          <p className="mt-8 border-t border-line pt-6 font-mono text-micro text-ink-muted">
            OrderDate &rarr; %d/%m/%Y &middot;{" "}
            {DAY_FIRST.supporting.toLocaleString("en-US")} rows for &middot;{" "}
            {DAY_FIRST.contradicting} against &middot; {FILE.rows.toLocaleString("en-US")} rows read
          </p>
        </div>
      </Reveal>

      <Reveal step={4}>
        <p className="v-display mt-16 max-w-[26ch] text-[clamp(1.625rem,3vw,2.25rem)] text-ink">
          Nothing on screen tells you which one you got. The wrong answers run perfectly well.
        </p>
      </Reveal>
    </Section>
  );
}
