"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * The honesty affordance (PRD §6, issue #6).
 *
 * Two claims, kept apart on purpose. Do not merge them, do not soften the third
 * paragraph, and never let this copy imply Vera can spot a wrong-but-runnable
 * answer live — there is no answer key at demo time.
 */
export function HowWeKnow({ align = "end" }: { align?: "start" | "center" | "end" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <HelpCircle data-icon="inline-start" aria-hidden />
          How do we know
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[22rem] max-w-[calc(100vw-2rem)] gap-4 bg-card p-4 ring-border"
      >
        <section className="space-y-1.5">
          <h3 className="text-sm font-medium text-primary">Per answer, live</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The number came out of Python that actually ran on the cells in your file. The code that
            ran and the cells it read are both on the card. When code cannot produce a value that
            traces back to real cells, Vera shows no number at all.
          </p>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-sm font-medium text-foreground">In aggregate, measured</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Vera&rsquo;s accuracy percentage comes from a fixed benchmark of questions with known
            answers, scored offline before the demo. It describes past runs on that benchmark, not
            this run on your file.
          </p>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-sm font-medium text-foreground">What this is not</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Vera cannot tell you that a number which ran cleanly is still the wrong answer to your
            question. Your file has no answer key. Live, the claim is exactly this: computed, and
            traceable.
          </p>
        </section>
      </PopoverContent>
    </Popover>
  );
}
