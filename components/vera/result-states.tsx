"use client";

import { PlugZap, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HowWeKnow } from "./how-we-know";
import { Panel, SectionLabel } from "./panel";

/**
 * The three non-finding states of the result slot. All three keep the hero
 * footprint so the column never collapses and reflows mid-demo.
 */

/** Skeletons match the layout they replace — never a spinner for content. */
export function ResultSkeleton() {
  return (
    <Panel aria-hidden className="vera-rise">
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <Skeleton className="h-5 w-24 rounded-4xl" />
        <Skeleton className="h-3 w-32" />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Skeleton className="h-14 w-52" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-2/3 max-w-sm" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-12 w-44" />
          <Skeleton className="h-12 w-44" />
          <Skeleton className="h-12 w-32" />
        </div>
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Panel>
  );
}

/** The empty state carries real copy and one action — never "No data". */
export function EmptyResult({ onUseExample }: { onUseExample: () => void }) {
  return (
    <Panel className="vera-rise">
      <CardHeader>
        <SectionLabel icon={<ScanSearch className="size-3.5" aria-hidden />}>Finding</SectionLabel>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-medium tracking-[-0.02em] text-foreground">
            Nothing analysed yet
          </h2>
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            Ask a question about the loaded file. Vera writes the analysis code, runs it in an
            isolated sandbox, and puts the code and the exact cells it read next to whatever number
            she reports. If the code cannot produce a traceable number, she reports no number.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onUseExample}>
            Start with an example question
          </Button>
          <HowWeKnow align="start" />
        </div>
      </CardContent>
    </Panel>
  );
}

/** A stream that never arrived. Red here means it broke, not "unverified". */
export function RunErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel className="vera-rise ring-destructive/30">
      <CardHeader>
        <SectionLabel
          className="text-destructive"
          icon={<PlugZap className="size-3.5" aria-hidden />}
        >
          Run failed
        </SectionLabel>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-xl font-medium tracking-[-0.02em] text-foreground">
            Vera couldn&rsquo;t reach the analysis service
          </h2>
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            This is a connection problem, not a verdict on your data. Nothing was computed, so
            there is no number either way.
          </p>
        </div>
        <p className="overflow-x-auto rounded-md bg-surface-raised px-4 py-3 font-mono text-xs whitespace-pre-wrap text-foreground/80 ring-1 ring-border">
          {message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Panel>
  );
}
