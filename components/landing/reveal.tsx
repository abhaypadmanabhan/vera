"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Settles a block in as it ENTERS THE VIEWPORT.
 *
 * The previous version was a CSS load animation: every section ran its reveal in
 * the first second, so by the time you scrolled to section four it had been
 * finished for twenty seconds and the page read as completely static. Observing
 * the viewport is the fix — the motion now happens where the reader is looking.
 *
 * Two mechanisms, deliberately:
 *
 *  1. An IntersectionObserver, for the normal case.
 *  2. A scroll check, for the case the observer cannot see. If a block goes from
 *     below the viewport to above it in one step — an anchor jump, End, a fast
 *     flick — its intersection ratio is 0 both before and after, nothing
 *     changed, and the callback never runs. Measured on this page: 12 of 23
 *     blocks stayed invisible after a jump to the bottom. The scroll check is
 *     rAF-throttled and removes itself the moment the block is shown.
 *
 * Transform and opacity only. `prefers-reduced-motion` is handled in
 * globals.css, which leaves `.v-rise` at its end state — the content is visible
 * before this component has done anything at all.
 */
export function Reveal({
  children,
  step = 0,
  className = "",
}: {
  children: ReactNode;
  /** Stagger within a group, ~90ms apart. */
  step?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let live = true;

    const cleanup = () => {
      live = false;
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer?.disconnect();
    };

    const reveal = () => {
      if (!live) return;
      setShown(true);
      cleanup();
    };

    /** Shown once its top has risen above the fold line, or it is already past it. */
    const check = () => {
      frame = 0;
      if (!live) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) reveal();
    };

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(check);
    }

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) reveal();
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
          );
    observer?.observe(el);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // First measurement on the next frame: never a synchronous setState here.
    frame = requestAnimationFrame(check);

    return cleanup;
  }, []);

  return (
    <div
      ref={ref}
      data-shown={shown || undefined}
      className={`v-rise ${className}`}
      style={{ "--step": step } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
