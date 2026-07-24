"use client";

import { useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
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
import { ProvenanceRail } from "./provenance-rail";
import { SourceCells } from "./source-cells";
import { formatDuration, formatValue } from "./format";
import type { Finding } from "@/lib/types";

type VerifiedFinding = Extract<Finding, { verdict: "verified" }>;

/**
 * The hero (issue #6). This card *is* the product.
 *
 * It only ever renders for `verdict: "verified"` — the union in lib/types.ts
 * makes any other branch structurally incapable of carrying a number, and this
 * component takes the verified branch specifically so that stays true.
 */
export function ResultCard({ finding }: { finding: VerifiedFinding }) {
  const [showCode, setShowCode] = useState(false);
  const { grounding, execution, code } = finding;

  return (
    <Panel className="vera-rise relative">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-28 -left-20 size-72 rounded-full bg-primary/10 blur-3xl"
      />

      <CardHeader className="relative grid-cols-[1fr_auto] items-center">
        <Badge className="gap-1.5 bg-primary/15 text-primary">
          <ShieldCheck aria-hidden />
          Verified
        </Badge>
        <span className="vera-nums text-xs text-muted-foreground">
          {finding.attempts === 1 ? "1 attempt" : `${finding.attempts} attempts`} ·{" "}
          {formatDuration(execution.durationMs)} in sandbox
        </span>
      </CardHeader>

      <CardContent className="relative space-y-5">
        <div>
          <p className="vera-nums flex items-baseline gap-2 font-medium text-primary">
            {/* 56 in the scale, bumped one step because this is read off a projector. */}
            <span className="text-[clamp(3rem,8vw,4rem)] leading-none tracking-[-0.03em]">
              {formatValue(finding.value)}
            </span>
            {finding.unit ? (
              <span className="text-3xl leading-none text-primary/70">{finding.unit}</span>
            ) : null}
          </p>
          <p className="mt-3 max-w-[65ch] text-base leading-relaxed text-foreground">
            {finding.claim}
          </p>
        </div>

        <ProvenanceRail
          source={`${grounding.columns.join(", ")} · ${grounding.rowCount} rows`}
          executed={`${code.lineCount} lines of pandas · exit ${execution.exitCode}`}
          traced={`${formatValue(finding.value)}${finding.unit ?? ""}`}
        />

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
              Code that ran
            </SectionLabel>
            <span className="vera-nums text-xs text-muted-foreground">
              {showCode ? "Hide" : "Show"} {code.lineCount} lines
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3">
            <p className="max-w-[65ch] text-sm text-muted-foreground">{code.explanation}</p>
            <CodeBlock source={code.source} label="The Python that produced this number" />
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <div className="flex gap-1.5">
                <dt>Exit code</dt>
                <dd className="vera-nums font-mono text-foreground">{execution.exitCode}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Duration</dt>
                <dd className="vera-nums font-mono text-foreground">
                  {formatDuration(execution.durationMs)}
                </dd>
              </div>
              <div className="flex min-w-0 gap-1.5">
                <dt>stdout</dt>
                <dd className="truncate font-mono text-foreground">
                  {execution.stdout.trim() || "—"}
                </dd>
              </div>
            </dl>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <div className="space-y-3">
          <SectionLabel className="text-foreground">Cells this read</SectionLabel>
          <SourceCells grounding={grounding} />
        </div>
      </CardContent>

      <div className="relative flex items-center justify-between gap-3 px-(--card-spacing)">
        <p className="text-xs text-muted-foreground">
          Computed by the code above, traced to the cells above.
        </p>
        <HowWeKnow />
      </div>
    </Panel>
  );
}
