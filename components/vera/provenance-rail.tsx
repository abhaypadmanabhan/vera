import { ArrowRight, Code2, ShieldCheck, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The chain of custody, in one line: which cells were read, what ran on them,
 * what came out. The card's signature element — it is the argument the whole
 * product makes, compressed to a single strip you can read in a second.
 *
 * Scrolls inside itself; the page never scrolls sideways for it.
 */
export function ProvenanceRail({
  source,
  executed,
  traced,
}: {
  source: string;
  executed: string;
  traced: string;
}) {
  const links = [
    { icon: Table2, label: "Read", value: source, accent: false },
    { icon: Code2, label: "Ran", value: executed, accent: false },
    { icon: ShieldCheck, label: "Traced", value: traced, accent: true },
  ];

  return (
    <div className="overflow-x-auto">
      <ol className="flex w-max items-stretch gap-2">
        {links.map((link, index) => (
          <li key={link.label} className="flex items-center gap-2">
            <div
              className={cn(
                "rounded-md px-3 py-2 ring-1",
                link.accent
                  ? "bg-primary/10 ring-primary/30"
                  : "bg-surface-raised ring-border",
              )}
            >
              <span className="flex items-center gap-1.5 text-[0.6875rem] tracking-[0.09em] uppercase">
                <link.icon
                  className={cn("size-3", link.accent ? "text-primary" : "text-muted-foreground")}
                  aria-hidden
                />
                <span className={link.accent ? "text-primary" : "text-muted-foreground"}>
                  {link.label}
                </span>
              </span>
              <span
                className={cn(
                  "vera-nums mt-0.5 block font-mono text-xs whitespace-nowrap",
                  link.accent ? "text-primary" : "text-foreground/80",
                )}
              >
                {link.value}
              </span>
            </div>
            {index < links.length - 1 ? (
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
