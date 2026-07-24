"use client";

import { useCallback, useMemo, useState } from "react";
import { useAnalysis } from "@/hooks/use-analysis";
import { buildDeck } from "@/lib/deck";
import type { DatasetSummary } from "@/lib/types";
import { AskScreen } from "./ask-screen";
import { TopBar } from "./chrome";
import { DeckPlayer } from "./deck-player";
import { FindingScreen } from "./finding-screen";
import { WorkingScreen } from "./working-screen";

/**
 * The client half of the product: ask → working → finding, one screen at a time
 * (DESIGN.md v3 "Layout" — progressive disclosure, not a dump).
 *
 * It owns only the phase and the question. Everything about the run itself comes
 * from `useAnalysis()`, which folds the server's `StageEvent`s; nothing here
 * advances a stage or invents a number.
 */
export function Console({
  dataset,
  suggestions,
  isMock,
}: {
  dataset: DatasetSummary;
  suggestions: string[];
  isMock: boolean;
}) {
  const { stages, finding, error, isRunning, start, reset } = useAnalysis();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const submit = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setAsked(trimmed);
    setStartedAt(Date.now());
    setSubmitted(true);
    void start(trimmed, dataset.id);
  }, [dataset.id, question, start]);

  const askAgain = useCallback(() => {
    reset();
    setSubmitted(false);
    setAsked("");
    setQuestion("");
    setStartedAt(0);
  }, [reset]);

  const settled = finding !== null || error !== null;
  const phase = !submitted ? "ask" : settled ? "finding" : "working";
  const deck = useMemo(
    () =>
      finding?.verdict === "verified"
        ? buildDeck(asked, finding, {
            datasetId: dataset.id,
            filename: dataset.filename,
            rowCount: dataset.rowCount,
            columns: dataset.columns,
            duplicateRowCount: dataset.duplicateRowCount,
            crossChecks: [],
            notes: dataset.notes,
          })
        : null,
    [asked, dataset, finding],
  );

  const askFollowUp = useCallback(
    (nextQuestion: string) => {
      setQuestion(nextQuestion);
      setAsked(nextQuestion);
      setStartedAt(Date.now());
      setSubmitted(true);
      void start(nextQuestion, dataset.id);
    },
    [dataset.id, start],
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {(phase !== "finding" || finding?.verdict !== "verified") && (
        <TopBar isMock={isMock} className="mx-auto w-full max-w-5xl px-6 py-5" />
      )}

      {phase === "ask" && (
        <AskScreen
          question={question}
          onQuestionChange={setQuestion}
          onSubmit={submit}
          suggestions={suggestions}
          dataset={dataset}
        />
      )}

      {phase === "working" && (
        <WorkingScreen
          question={asked}
          stages={stages}
          isRunning={isRunning}
          startedAt={startedAt}
        />
      )}

      {phase === "finding" && finding?.verdict === "verified" && deck && (
        <DeckPlayer
          deck={deck}
          finding={finding}
          dataset={dataset}
          isMock={isMock}
          onNewQuestion={askFollowUp}
        />
      )}

      {phase === "finding" && finding?.verdict === "unverified" && (
        <FindingScreen
          question={asked}
          finding={finding}
          dataset={dataset}
          onReset={askAgain}
        />
      )}

      {phase === "finding" && !finding && error && (
        <div className="mx-auto w-full max-w-2xl px-6 pt-4 pb-24">
          <p className="text-small text-ink-muted">{asked}</p>
          <h1 className="mt-6 text-title font-medium text-ink">The run did not complete.</h1>
          <p className="mt-4 max-w-[62ch] text-body text-ink-muted">{error}</p>
          <button
            type="button"
            onClick={askAgain}
            className="mt-8 rounded-full border border-line px-4 py-2 text-small text-ink transition-colors duration-150 hover:bg-sunk"
          >
            Ask another question
          </button>
        </div>
      )}
    </div>
  );
}
