"use client";

import { useCallback, useMemo, useState } from "react";
import { useAnalysis } from "@/hooks/use-analysis";
import { buildDeck } from "@/lib/deck";
import type { DatasetSummary } from "@/lib/types";
import { AskScreen } from "./ask-screen";
import { TopBar } from "./chrome";
import { DeckPlayer, type DeckBenchmark } from "./deck-player";
import { suggestFollowUps } from "@/lib/follow-ups";
import { FindingScreen } from "./finding-screen";
import { chipsFor } from "./prep-screen";
import { usePrepare } from "./use-prep";
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
  benchmark,
  isMock,
}: {
  dataset: DatasetSummary;
  suggestions: string[];
  benchmark: DeckBenchmark;
  isMock: boolean;
}) {
  const { stages, finding, error, isRunning, start, reset } = useAnalysis();
  const prep = usePrepare();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  /**
   * The file every question is answered about. It becomes the uploaded file the
   * moment prep reports — including a prep that failed open, because she then
   * works from that file as it came. Until then the demo file stays askable, so
   * the screen is never locked behind a prep.
   */
  const activeDataset = prep.summary ?? dataset;
  const upload = prep.summary ? (prep.upload ?? undefined) : undefined;

  /**
   * Chips are the uploaded file's own questions once it is prepared — the route
   * already filtered them through the guardrail. A failed prep offers none
   * rather than offering a question about a file she is no longer reading.
   */
  const chips = prep.report ? chipsFor(prep.report) : suggestions;

  /**
   * Ask an explicit question. Chips call this with their own text so a click runs
   * immediately — routing through `question` state first raced the submit and left
   * the box cleared with nothing running.
   */
  const ask = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setQuestion(trimmed);
      setAsked(trimmed);
      setStartedAt(Date.now());
      setSubmitted(true);
      void start(trimmed, activeDataset.id, upload);
    },
    [activeDataset.id, start, upload],
  );

  const submit = useCallback(() => ask(question), [ask, question]);

  const askAgain = useCallback(() => {
    reset();
    setSubmitted(false);
    setAsked("");
    setQuestion("");
    setStartedAt(0);
  }, [reset]);

  const settled = finding !== null || error !== null;
  const phase = !submitted ? "ask" : settled ? "finding" : "working";
  const profile = useMemo(
    () => ({
      datasetId: activeDataset.id,
      filename: activeDataset.filename,
      rowCount: activeDataset.rowCount,
      columns: activeDataset.columns,
      duplicateRowCount: activeDataset.duplicateRowCount,
      crossChecks: [],
      notes: activeDataset.notes,
    }),
    [activeDataset],
  );

  const deck = useMemo(
    () =>
      finding?.verdict === "verified" ? buildDeck(asked, finding, profile) : null,
    [asked, finding, profile],
  );

  // "You might also ask..." — derived from the columns the code actually read,
  // and filtered through the guardrail so every suggestion is answerable.
  const suggestedFollowUps = useMemo(
    () => (finding ? suggestFollowUps(finding, profile) : []),
    [finding, profile],
  );

  const askFollowUp = useCallback(
    (nextQuestion: string) => {
      setQuestion(nextQuestion);
      setAsked(nextQuestion);
      setStartedAt(Date.now());
      setSubmitted(true);
      void start(nextQuestion, activeDataset.id, upload);
    },
    [activeDataset.id, start, upload],
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
          onAsk={ask}
          suggestions={chips}
          dataset={activeDataset}
          prep={prep}
          onFile={(file) => void prep.prepare(file)}
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
          dataset={activeDataset}
          benchmark={benchmark}
          isMock={isMock}
          suggestedFollowUps={suggestedFollowUps}
          onNewQuestion={askFollowUp}
        />
      )}

      {phase === "finding" && finding?.verdict === "unverified" && (
        <FindingScreen
          question={asked}
          finding={finding}
          dataset={activeDataset}
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
