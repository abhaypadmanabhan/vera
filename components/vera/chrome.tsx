import Link from "next/link";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

/**
 * The only chrome on the page: who this is, whether a sandbox is really running,
 * and the theme. Everything else lives in the flow.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span className="text-body font-medium tracking-[-0.02em] text-ink">Vera</span>
      <span className="hidden text-micro text-ink-muted sm:inline">shows her work</span>
    </span>
  );
}

/**
 * Honesty rule (PRD §6): when the mock engine is driving, the page says so, in
 * the same breath as the product name. No copy may let a scripted run read as a
 * real sandbox execution.
 */
export function MockBadge({ isMock }: { isMock: boolean }) {
  if (!isMock) return null;
  return (
    <span className="v-label rounded-full border border-warn/40 bg-warn-wash px-2.5 py-1 text-warn">
      Mock engine · no sandbox call
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
      <div className="flex items-center gap-3">
        <Wordmark />
        <MockBadge isMock={isMock} />
      </div>
      <div className="flex items-center gap-1.5">
        {right}
        <Link
          href="/open"
          className="rounded-full px-3 py-1.5 text-micro text-ink-muted transition-colors duration-150 hover:bg-sunk hover:text-ink"
        >
          Cold open
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
