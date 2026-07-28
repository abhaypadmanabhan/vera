/*
 * The four vendors, and the one job each of them does.
 *
 * These are real relationships — Vera genuinely calls all four — so the official
 * marks are honest here in a way a borrowed "trusted by" wall never is. They
 * appear once, in the proof strip, rendered as masks so they take the page's own
 * muted ink in both themes without altering the artwork.
 */
import styles from "./landing.module.css";

export const SPONSORS = [
  {
    name: "Daytona",
    // Their official mark is a glyph alone, so the name is set beside it.
    glyphOnly: true,
    logoClass: styles.daytonaLogo,
    role: "Runs the model's code in a sandbox that cannot touch anything else.",
  },
  {
    name: "Fireworks AI",
    glyphOnly: false,
    logoClass: styles.fireworksLogo,
    role: "Writes the calculation, against what the file actually contains.",
  },
  {
    name: "Braintrust",
    glyphOnly: false,
    logoClass: styles.braintrustLogo,
    role: "Scores the test offline, so the accuracy figure has a source.",
  },
  {
    name: "ElevenLabs",
    glyphOnly: false,
    logoClass: styles.elevenLabsLogo,
    role: "Gives her the voice she presents the finding in.",
  },
] as const;

/** A still row. Nothing scrolls; a marquee reads as filler, not confidence. */
export function SponsorMarks() {
  return (
    <ul className="flex flex-wrap items-center gap-x-8 gap-y-6 text-ink-muted">
      {SPONSORS.map((sponsor) => (
        <li key={sponsor.name} className="flex items-center gap-3">
          <span
            aria-hidden={sponsor.glyphOnly ? true : undefined}
            aria-label={sponsor.glyphOnly ? undefined : sponsor.name}
            role={sponsor.glyphOnly ? undefined : "img"}
            className={`${styles.logo} ${sponsor.logoClass}`}
          />
          {sponsor.glyphOnly ? (
            <span className="text-body font-medium tracking-[-0.01em]">{sponsor.name}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
