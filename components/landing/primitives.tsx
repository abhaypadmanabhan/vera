/*
 * Landing primitives — DESIGN.md v4 tokens only. No new colour, no new family,
 * no size outside the scale.
 *
 * Deliberately thin. `Section` owns horizontal gutter and measure and NOTHING
 * else: vertical rhythm is set per section, because a uniform `py-36` on every
 * band is the tell the vault names first ("200-290px voids that read as
 * unfinished"). Each section below picks its own top and bottom.
 */
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The CTA pair. Primary is the ink pill into the live demo; secondary is a
 * hairline link into the recorded cold open. Both say what happens next.
 */
export function Cta({
  href,
  children,
  tone = "primary",
}: {
  href: string;
  children: ReactNode;
  tone?: "primary" | "secondary";
}) {
  const base =
    "group inline-flex items-center gap-3 rounded-full px-6 py-3 text-body font-medium transition-[transform,background-color,border-color,color] duration-[260ms] ease-settle motion-safe:hover:-translate-y-px";

  return (
    <Link
      href={href}
      className={
        tone === "primary"
          ? `${base} bg-ink text-bg hover:bg-accent`
          : `${base} border border-line-strong text-ink hover:border-ink hover:text-ink`
      }
    >
      {children}
      <span
        aria-hidden
        className="transition-transform duration-[260ms] ease-settle motion-safe:group-hover:translate-x-1"
      >
        &rarr;
      </span>
    </Link>
  );
}

/** Horizontal gutter + measure. Vertical rhythm is the caller's business. */
export function Section({
  children,
  className = "",
  wide = false,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
  as?: "section" | "header" | "footer";
}) {
  return (
    <Tag className={`px-6 sm:px-12 ${className}`}>
      <div className={`mx-auto w-full ${wide ? "max-w-[78rem]" : "max-w-[68rem]"}`}>{children}</div>
    </Tag>
  );
}

/**
 * Re-exported so every call site keeps importing `Reveal` from here. The
 * implementation moved to its own client module when it became an
 * IntersectionObserver — this file stays a server component.
 */
export { Reveal } from "./reveal";

/**
 * The one icon on the page that is not a directional arrow. It marks a verified
 * figure, which is the single thing the accent is allowed to mean — a hairline
 * check, not a coloured status dot.
 */
export function CheckMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`size-4 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 8.5 6 12l7.5-8" />
    </svg>
  );
}
