/*
 * Powered by — four real relationships, one line each.
 *
 * The marks themselves were spent once, in the proof strip under the hero,
 * where recognition is worth something. Repeating them here would be a fourth
 * variation of the same object; this section is the explanation instead, set
 * full measure as a name-against-its-job list. The infinite marquee it replaces
 * was motion standing in for an argument.
 */
import { Reveal, Section } from "./primitives";
import { SPONSORS } from "./sponsors";

export function PoweredBy() {
  return (
    <Section className="border-t border-line py-12 sm:py-16">
      <Reveal>
        <h2 className="v-display max-w-[26ch] text-[clamp(1.75rem,3.4vw,2.5rem)]">
          Four pieces, each doing exactly one job.
        </h2>
      </Reveal>

      <Reveal step={1}>
        <dl className="mt-12 border-t border-line">
          {SPONSORS.map((sponsor) => (
            <div
              key={sponsor.name}
              className="grid gap-x-12 gap-y-2 border-b border-line py-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-baseline"
            >
              <dt className="text-body font-medium text-ink">{sponsor.name}</dt>
              <dd className="max-w-[56ch] text-small text-ink-muted">{sponsor.role}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  );
}
