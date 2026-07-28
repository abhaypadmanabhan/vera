"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
 * Transform and opacity only.
 *
 * The hidden start state is NOT in the served HTML. `.v-rise` is visible until
 * this effect stamps `v-js` on `<html>`, which is what arms the `opacity: 0`
 * rule in globals.css. So the hiding is done by the same code that undoes it: no
 * JavaScript, a blocked bundle, or a chunk that 404s all leave the page readable
 * rather than blank. `prefers-reduced-motion` never arms it at all.
 *
 * Two consequences worth stating, because both are load-bearing:
 *
 *  - The stamp and the first measurement happen in ONE synchronous pass, and
 *    `data-shown` is written straight to the node rather than through state. A
 *    render round-trip between the two would give the browser a frame in which
 *    everything is armed and nothing is shown — visible content snapping to
 *    blank and rising back in. There must be no paint between them.
 *  - Consequently a block already in view at mount is never hidden, so it does
 *    not animate on load. That is the intended reading of this component: the
 *    reveal belongs to scrolling, not to arrival, and it is also why the hero
 *    now paints with the HTML instead of waiting for the bundle.
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Arms the hidden start state. Idempotent, and deliberately never removed:
    // `.v-rise` exists only on this page, so a leftover class matches nothing.
    document.documentElement.classList.add("v-js");

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
      el.setAttribute("data-shown", "");
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
    // Synchronously, in the same task as the stamp above — see the note on
    // paints in the block comment. Anything already in view is shown before the
    // browser ever sees the armed state.
    check();

    return cleanup;
  }, []);

  return (
    <div
      ref={ref}
      className={`v-rise ${className}`}
      style={{ "--step": step } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
