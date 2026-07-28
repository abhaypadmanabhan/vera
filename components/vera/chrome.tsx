import Link from "next/link";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

/**
 * The only chrome on the page: who this is, whether a sandbox is really running,
 * and the theme. It recedes — everything that matters lives in the flow below.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span className="text-body font-medium tracking-[-0.02em] text-ink">Vera</span>
      <span className="hidden text-small text-ink-muted sm:inline">shows her work</span>
    </span>
  );
}

/**
 * Honesty rule (PRD §6): when the mock engine is driving, the page says so.
 *
 * It says it quietly. A shouting amber pill made the disclaimer the loudest
 * object on the screen, above the product itself — which is not what the rule
 * asks for, and colour spent on something that needs no action is exactly the
 * "coloured status" tell the UI-UX vault names. So: plain ink, sentence case,
 * and a dashed ring — the outline of a thing that is not the real article.
 */
export function MockBadge({ isMock }: { isMock: boolean }) {
  if (!isMock) return null;
  return (
    <span
      className="inline-flex items-center gap-2 text-small text-ink-muted"
      title="Mock engine — no sandbox call is made"
    >
      <svg viewBox="0 0 12 12" className="size-3 shrink-0" fill="none" aria-hidden>
        <circle
          cx="6"
          cy="6"
          r="5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.1 2.4"
        />
      </svg>
      <span>
        Mock engine
        <span className="hidden sm:inline"> · no sandbox call</span>
      </span>
    </span>
  );
}

export function TopBar({
  isMock,
  right,
  className,
}: {
  isMock: boolean;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <Wordmark />
        {isMock && <span aria-hidden className="h-4 w-px shrink-0 bg-line" />}
        <MockBadge isMock={isMock} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {right}
        <Link
          href="/open"
          className="rounded-full px-3 py-1.5 text-small text-ink-muted transition-colors duration-150 hover:bg-sunk hover:text-ink"
        >
          Cold open
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
