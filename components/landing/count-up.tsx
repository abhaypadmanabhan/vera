"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Counts a figure up to its real value once, when it scrolls into view.
 *
 * The final value is the only value ever *stated*: it is what the server
 * renders, what a screen reader is given, and what a copy-paste yields. The
 * count is decoration laid over a figure that is already correct — so if the
 * JS never runs, or motion is unwelcome, the true number is simply there.
 */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const DURATION = 1100;
        let start: number | null = null;

        const tick = (now: number) => {
          start ??= now;
          const t = Math.min((now - start) / DURATION, 1);
          // The page's own settle curve: fast away, eased to rest.
          setShown(value * (1 - Math.pow(1 - t, 3)));
          if (t < 1) frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref}>
      <span aria-hidden>{shown.toFixed(decimals)}%</span>
      <span className="sr-only">{value.toFixed(decimals)}%</span>
    </span>
  );
}
