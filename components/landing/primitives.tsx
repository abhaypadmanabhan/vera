/*
 * Landing primitives — DESIGN.md v3 tokens only. No new colour, no new family.
 *
 * The whole page is one scroll narrative, so everything here is built for
 * reading from across a room: hairline rules instead of cards, mono eyebrows
 * instead of chrome, and figures that are always tabular.
 */
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one CTA idiom. Repeats in the hero and at the very bottom; both point at
 * the live demo, so it is a link and not a button.
 */
export function SpeakToVera({ tone = "solid" }: { tone?: "solid" | "quiet" }) {
  const base =
    "group inline-flex items-center gap-3 rounded-full px-7 py-3.5 text-lead font-medium transition-[transform,background-color,border-color] duration-[260ms] ease-settle motion-safe:hover:-translate-y-0.5";

  return (
    <Link
      href="/ask"
      className={
        tone === "solid"
          ? `${base} bg-ink text-bg hover:bg-accent`
          : `${base} border border-line-strong text-ink hover:border-accent hover:text-accent`
      }
    >
      Speak to Vera
      <span
        aria-hidden
        className="transition-transform duration-[260ms] ease-settle motion-safe:group-hover:translate-x-1"
      >
        &rarr;
      </span>
    </Link>
  );
}

/** Section wrapper: the page's vertical rhythm lives here and nowhere else. */
export function Section({
  eyebrow,
  children,
  className = "",
}: {
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-line px-6 py-28 sm:px-10 sm:py-36 ${className}`}>
      <div className="mx-auto w-full max-w-[68rem]">
        {eyebrow ? <p className="v-label mb-14">{eyebrow}</p> : null}
        {children}
      </div>
    </section>
  );
}

/**
 * Fades a block in as it enters the viewport. Transform + opacity only, and
 * `prefers-reduced-motion` is handled in globals.css, which forces the end
 * state — so the content is never left invisible.
 */
export function Reveal({
  children,
  step = 0,
  className = "",
}: {
  children: ReactNode;
  step?: number;
  className?: string;
}) {
  return (
    <div
      className={`v-reveal-slow ${className}`}
      style={{ "--step": step } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
