"use client";

import { useState } from "react";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { CodeBlock } from "./code-block";
import { HowWeKnow } from "./how-we-know";
import { Panel, SectionLabel } from "./panel";
import { BLOCK_REASON_COPY } from "@/lib/types";
import type { Finding } from "@/lib/types";

type UnverifiedFinding = Extract<Finding, { verdict: "unverified" }>;

/**
 * Refusing to answer is the feature, so it gets the same footprint and the same
 * craft as the verified card — amber, not red; a designed state, not an error
 * toast (issue #6, DESIGN.md).
 *
 * There is no number on this card. The `unverified` branch of `Finding` has no
 * `value` field at all, so there is nothing here that could leak one.
 */
export function UnverifiedCard({ finding }: { finding: UnverifiedFinding }) {
  const [showCode, setShowCode] = useState(false);

  return (
    <Panel className="vera-rise relative ring-warning/30">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-28 -left-20 size-72 rounded-full bg-warning/10 blur-3xl"
      />

      <CardHeader className="relative grid-cols-[1fr_auto] items-center">
        <Badge className="gap-1.5 bg-warning/15 text-warning">
          <ShieldAlert aria-hidden />
          Unverified
        </Badge>
        <span className="vera-nums text-xs text-muted-foreground">
          {finding.attempts === 1 ? "1 attempt" : `${finding.attempts} attempts`} · no number
          released
        </span>
      </CardHeader>

      <CardContent className="relative space-y-5">
        <div>
          <h2 className="text-xl font-medium tracking-[-0.02em] text-foreground">
            Vera has no number for this one.
          </h2>
          <p className="mt-2 max-w-[65ch] text-base leading-relaxed text-muted-foreground">
            {BLOCK_REASON_COPY[finding.reason]} A number that cannot be traced back to real cells
            does not get shown, so there is nothing to report here.
          </p>
        </div>

        <div className="space-y-2">
          <SectionLabel className="text-foreground">What happened</SectionLabel>
          <p className="rounded-md bg-surface-raised px-4 py-3 font-mono text-xs leading-relaxed text-foreground/80 ring-1 ring-border">
            {finding.detail}
          </p>
        </div>

        {finding.code ? (
          <>
            <Separator />
            <Collapsible open={showCode} onOpenChange={setShowCode} className="space-y-3">
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-md text-left">
                <SectionLabel
                  className="text-foreground"
                  icon={
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 transition-transform duration-150 group-data-[state=open]:rotate-90"
                    />
                  }
                >
                  Code that was attempted
                </SectionLabel>
                <span className="vera-nums text-xs text-muted-foreground">
                  {showCode ? "Hide" : "Show"} {finding.code.lineCount} lines
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3">
                <p className="max-w-[65ch] text-sm text-muted-foreground">
                  {finding.code.explanation}
                </p>
                <CodeBlock
                  source={finding.code.source}
                  label="The Python Vera attempted, which did not produce a traceable number"
                />
              </CollapsibleContent>
            </Collapsible>
          </>
        ) : null}
      </CardContent>

      <div className="relative flex flex-wrap items-center justify-between gap-3 px-(--card-spacing)">
        <p className="max-w-[48ch] text-xs text-muted-foreground">
          Clean the column the error names, or narrow the question, then ask again.
        </p>
        <HowWeKnow />
      </div>
    </Panel>
  );
}
