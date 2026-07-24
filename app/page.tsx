"use client";

import { useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { Separator } from "@/components/ui/separator";
import { CsvPanel } from "@/components/vera/csv-panel";
import { HowWeKnow } from "@/components/vera/how-we-know";
import { QuestionPanel } from "@/components/vera/question-panel";
import { ResultCard } from "@/components/vera/result-card";
import { EmptyResult, ResultSkeleton, RunErrorCard } from "@/components/vera/result-states";
import { StageTimeline } from "@/components/vera/stage-timeline";
import { UnverifiedCard } from "@/components/vera/unverified-card";
import { useAnalysis } from "@/hooks/use-analysis";
import { DEMO_CSV, DEMO_QUESTIONS } from "@/data/demo";
import type { CsvPayload } from "@/lib/types";

// Matches DEMO_CSV_FILENAME in lib/config.ts, restated here because config.ts
// reads process.env and must not be pulled into the client bundle.
const DEMO_FILE: CsvPayload = { filename: "demo-business.csv", content: DEMO_CSV };

/** Stagger-in on first load, ~40ms apart (DESIGN.md "Motion"). */
const stagger = (index: number) => ({ ["--stagger"]: index }) as CSSProperties;

export default function Home() {
  const { stages, finding, error, isRunning, start, reset } = useAnalysis();
  const [csv, setCsv] = useState<CsvPayload>(DEMO_FILE);
  const [isDemo, setIsDemo] = useState(true);
  const [question, setQuestion] = useState("");
  const [currentRun, setCurrentRun] = useState({ id: 0, startedAt: 0 });

  const run = useCallback(
    (asked: string) => {
      setQuestion(asked);
      setCurrentRun((previous) => ({ id: previous.id + 1, startedAt: Date.now() }));
      void start(asked, csv);
    },
    [csv, start],
  );

  const loadCsv = useCallback(
    (payload: CsvPayload, demo: boolean) => {
      reset();
      setCsv(payload);
      setIsDemo(demo);
    },
    [reset],
  );

  return (
    <div className="relative isolate flex flex-1 flex-col">
      <div
        aria-hidden
        className="vera-atmosphere vera-grain pointer-events-none absolute inset-0 -z-10"
      />

      <main className="mx-auto w-full max-w-7xl px-6 py-10 lg:px-10 lg:py-14">
        <header
          className="vera-rise flex flex-wrap items-start justify-between gap-x-6 gap-y-3"
          style={stagger(0)}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-md bg-primary/10 font-mono text-sm font-semibold text-primary ring-1 ring-primary/30"
              >
                V
              </span>
              <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">Vera</h1>
              <Separator orientation="vertical" className="h-4" />
              <p className="text-sm text-muted-foreground">the analyst that shows her work</p>
            </div>
            <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
              Vera writes the analysis code, runs it in an isolated sandbox, and puts that code and
              the exact cells it read next to the number. She will not state a number she cannot
              show the work for.
            </p>
          </div>
          <HowWeKnow />
        </header>

        <div className="mt-8 grid gap-5 lg:grid-cols-12 lg:items-start">
          <div className="flex flex-col gap-5 lg:col-span-5">
            <div className="vera-rise" style={stagger(1)}>
              <CsvPanel
                csv={csv}
                isDemo={isDemo}
                disabled={isRunning}
                onLoad={(payload) => loadCsv(payload, false)}
                onResetToDemo={() => loadCsv(DEMO_FILE, true)}
              />
            </div>
            <div className="vera-rise" style={stagger(2)}>
              <QuestionPanel
                value={question}
                examples={DEMO_QUESTIONS}
                isRunning={isRunning}
                onChange={setQuestion}
                onSubmit={run}
              />
            </div>
          </div>

          <div className="flex flex-col gap-5 lg:col-span-7">
            <div className="vera-rise" style={stagger(3)}>
              <StageTimeline
                stages={stages}
                isRunning={isRunning}
                runId={currentRun.id}
                startedAt={currentRun.startedAt}
              />
            </div>
            <div className="vera-rise" style={stagger(4)}>
              {finding ? (
                finding.verdict === "verified" ? (
                  <ResultCard finding={finding} />
                ) : (
                  <UnverifiedCard finding={finding} />
                )
              ) : error ? (
                <RunErrorCard message={error} onRetry={() => run(question || DEMO_QUESTIONS[0])} />
              ) : isRunning ? (
                <ResultSkeleton />
              ) : (
                <EmptyResult onUseExample={() => run(DEMO_QUESTIONS[0])} />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
