/*
 * Powered by — a quiet auto-scrolling marquee.
 *
 * Official vendor wordmarks are rendered as masks so they share the landing
 * page's muted ink in both themes without altering the source artwork.
 *
 * Motion is a single transform-only keyframe, duplicated track for a seamless
 * loop, paused on hover and killed entirely by prefers-reduced-motion.
 */
import styles from "./landing.module.css";
import { Reveal, Section } from "./primitives";

const SPONSORS = [
  {
    name: "Daytona",
    logoClass: styles.daytonaLogo,
    role: "The isolated sandbox that runs model-written code safely",
  },
  {
    name: "Fireworks AI",
    logoClass: styles.fireworksLogo,
    role: "Writes the pandas from a profiled schema",
  },
  {
    name: "Braintrust",
    logoClass: styles.braintrustLogo,
    role: "The offline benchmark behind the accuracy figure",
  },
  {
    name: "ElevenLabs",
    logoClass: styles.elevenLabsLogo,
    role: "Vera presents the finding out loud",
  },
] as const;

function Track({ ariaHidden }: { ariaHidden: boolean }) {
  return (
    <ul
      aria-hidden={ariaHidden || undefined}
      className={`flex shrink-0 items-stretch ${styles.track}`}
    >
      {SPONSORS.map((sponsor) => (
        <li
          key={sponsor.name}
          className="flex w-[22rem] shrink-0 flex-col justify-between gap-6 border-r border-line px-10 py-2 sm:w-[26rem]"
        >
          <span
            aria-label={sponsor.name}
            className={`${styles.logo} ${sponsor.logoClass} text-ink-muted`}
            role="img"
          />
          <p className="max-w-[30ch] text-small text-ink-muted">{sponsor.role}</p>
        </li>
      ))}
    </ul>
  );
}

export function PoweredBy() {
  return (
    <Section eyebrow="Powered by">
      <Reveal>
        <h2 className="max-w-[26ch] text-[clamp(2rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.02em]">
          Four pieces, each doing exactly one job.
        </h2>
      </Reveal>

      <Reveal step={1}>
        <div className={`${styles.marquee} mt-16 flex gap-0 overflow-hidden border-y border-line py-10`}>
          <Track ariaHidden={false} />
          <Track ariaHidden />
        </div>
      </Reveal>
    </Section>
  );
}
