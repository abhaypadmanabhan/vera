import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A numbered exhibit. Hairline border, recessed paper fill, mono smallcaps label
 * above — no card, no shadow, no radius (DESIGN.md "Components").
 *
 * The lettering is not decoration: A is the code, B is the cells, C is what was
 * proven about the data. Evidence is filed in the order it was produced.
 */
export function Exhibit({
  letter,
  title,
  note,
  weight = "default",
  children,
}: {
  letter: string;
  title: string;
  /** Right-hand mono line: counts, timings, provenance. Optional. */
  note?: string;
  /** `primary` gives the exhibit a red margin rule — Exhibit C carries the proof. */
  weight?: "default" | "primary";
  children: ReactNode;
}) {
  return (
    <section className="v-uncover mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule pb-2">
        <h3 className="v-label text-ink">
          <span className="text-mark-ink">Exhibit {letter}</span>
          <span aria-hidden> — </span>
          <span className="sr-only">: </span>
          {title}
        </h3>
        {note ? <p className="v-label">{note}</p> : null}
      </div>
      <div
        className={cn(
          "border border-t-0 border-rule bg-paper-deep",
          weight === "primary" && "border-l-2 border-l-mark",
        )}
      >
        {children}
      </div>
    </section>
  );
}
