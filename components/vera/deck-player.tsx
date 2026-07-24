"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Deck, Slide } from "@/lib/deck";
import { matchSlide } from "@/lib/deck";
import { isProven } from "@/lib/types";
import type { DatasetSummary, Finding, SchemaEvidence, SourceCell } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatCount, formatFigure } from "./format";
import { useNarrationAudio } from "./use-narration-audio";

const NARRATION_TIMING = {
  beatMs: 1_650,
  transitionMs: 260,
} as const;

type VerifiedFinding = Extract<Finding, { verdict: "verified" }>;

export function DeckPlayer({
  deck,
  finding,
  dataset,
  isMock,
  onNewQuestion,
}: {
  deck: Deck;
  finding: VerifiedFinding;
  dataset: DatasetSummary;
  isMock: boolean;
  onNewQuestion: (question: string) => void;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [activeBeat, setActiveBeat] = useState(0);
  const [narrating, setNarrating] = useState(true);
  const [referencing, setReferencing] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const transitionTimer = useRef<number | null>(null);

  const slide = deck.slides[slideIndex];
  const focus = slide?.beats[activeBeat]?.focus ?? null;
  const spokenLine = narrating ? (slide?.beats[activeBeat]?.spoken ?? null) : null;

  const goTo = useCallback(
    (nextIndex: number, asReference = false) => {
      const bounded = Math.max(0, Math.min(nextIndex, deck.slides.length - 1));
      setReferencing(asReference);
      setActiveBeat(0);
      if (bounded === slideIndex) return;
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
      setPreviousIndex(slideIndex);
      setSlideIndex(bounded);
      transitionTimer.current = window.setTimeout(() => {
        setPreviousIndex(null);
        transitionTimer.current = null;
      }, NARRATION_TIMING.transitionMs);
    },
    [deck.slides.length, slideIndex],
  );

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    },
    [],
  );

  /** Advance one beat, then one slide, then stop. Shared by the voice and the timer. */
  const advance = useCallback(() => {
    if (!slide) return;
    if (activeBeat < slide.beats.length - 1) {
      setActiveBeat((current) => current + 1);
      return;
    }
    if (slideIndex < deck.slides.length - 1) {
      goTo(slideIndex + 1);
      return;
    }
    setNarrating(false);
    setReferencing(false);
  }, [activeBeat, deck.slides.length, goTo, slide, slideIndex]);

  // Vera speaks the beat; the deck moves on when she finishes, so the blob is
  // always highlighting whatever she is currently saying.
  const {
    speaking: veraSpeaking,
    available: voiceAvailable,
    stop: stopNarrationAudio,
  } = useNarrationAudio({
    text: spokenLine,
    enabled: narrating,
    onEnded: advance,
  });

  const stopNarration = useCallback(() => {
    stopNarrationAudio();
    setNarrating(false);
    setReferencing(false);
  }, [stopNarrationAudio]);

  useEffect(() => {
    if (!narrating) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Escape" || event.key === " ") {
        event.preventDefault();
        stopNarration();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [narrating, stopNarration]);

  // Fallback pacing when there is no audio (mock mode, blocked autoplay, failure).
  useEffect(() => {
    if (!narrating || !slide || voiceAvailable) return;
    const id = window.setTimeout(advance, NARRATION_TIMING.beatMs);
    return () => window.clearTimeout(id);
  }, [advance, narrating, slide, voiceAvailable]);

  useEffect(() => {
    if (narrating) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        goTo(slideIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(slideIndex - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goTo(deck.slides.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck.slides.length, goTo, narrating, slideIndex]);

  const submitFollowUp = () => {
    const question = followUp.trim();
    if (!question) return;
    const matched = matchSlide(question, deck);
    setFollowUp("");
    if (matched) {
      const matchedIndex = deck.slides.findIndex((candidate) => candidate.id === matched.id);
      setNarrating(false);
      goTo(matchedIndex, true);
      return;
    }
    onNewQuestion(question);
  };

  if (!slide) return null;

  return (
    <main className="deck-shell" aria-label="Vera presentation">
      <header className="deck-topbar">
        <span className="deck-wordmark">Vera</span>
        <div className="flex items-center gap-3">
          {referencing && (
            <span className="deck-reference" role="status">
              Referring back
            </span>
          )}
          {isMock && <span className="deck-mock">Mock engine</span>}
          {narrating && (
            <button
              type="button"
              className="deck-stop"
              onClick={stopNarration}
              aria-label="Stop narration"
            >
              <span className="deck-stop-mark" aria-hidden />
              <span>Stop</span>
              <kbd>Esc</kbd>
              <kbd>Space</kbd>
            </button>
          )}
          <Link href="/open" className="deck-link">
            Cold open
          </Link>
        </div>
      </header>

      <div
        className="deck-stage"
        onClick={() => {
          if (!narrating) goTo(slideIndex + 1);
        }}
      >
        {previousIndex !== null && deck.slides[previousIndex] && (
          <div className="deck-layer deck-layer-out" aria-hidden>
            <DeckSlide
              slide={deck.slides[previousIndex]}
              finding={finding}
              dataset={dataset}
              activeFocus={null}
            />
          </div>
        )}
        <div key={slide.id} className="deck-layer deck-layer-in">
          <DeckSlide
            slide={slide}
            finding={finding}
            dataset={dataset}
            activeFocus={focus}
          />
        </div>
      </div>

      <footer className="deck-footer">
        <nav className="deck-rail" aria-label="Slides">
          {deck.slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!narrating) goTo(index);
              }}
              disabled={narrating}
              aria-label={`Go to slide ${index + 1}: ${item.title}`}
              aria-current={index === slideIndex ? "step" : undefined}
              className="deck-node"
            >
              <span />
            </button>
          ))}
          <span
            className="deck-rail-fill"
            style={{
              transform: `scaleX(${deck.slides.length > 1 ? slideIndex / (deck.slides.length - 1) : 1})`,
            }}
          />
        </nav>

        <div className="deck-status" aria-live="polite" aria-atomic="true">
          <span className="font-mono tabular-nums">
            {String(slideIndex + 1).padStart(2, "0")} / {String(deck.slides.length).padStart(2, "0")}
          </span>
          <span>{narrating ? slide.beats[activeBeat]?.spoken : "Use ← → or the rail to revisit"}</span>
          {veraSpeaking ? <span className="sr-only">Vera is speaking</span> : null}
        </div>

        {!narrating && (
          <form
            className="deck-follow-up"
            onSubmit={(event) => {
              event.preventDefault();
              submitFollowUp();
            }}
          >
            <label htmlFor="deck-follow-up" className="sr-only">
              Ask a follow-up
            </label>
            <input
              id="deck-follow-up"
              value={followUp}
              onChange={(event) => setFollowUp(event.target.value)}
              placeholder="Ask a follow-up"
            />
            <button type="submit">Ask</button>
          </form>
        )}
      </footer>
    </main>
  );
}

export function DeckSlide({
  slide,
  finding,
  dataset,
  activeFocus,
}: {
  slide: Slide;
  finding: VerifiedFinding;
  dataset: DatasetSummary;
  activeFocus: string | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [halo, setHalo] = useState({ x: 0, y: 0, visible: false });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !activeFocus) {
      setHalo((current) => ({ ...current, visible: false }));
      return;
    }
    const target = stage.querySelector<HTMLElement>(`[data-focus="${activeFocus}"]`);
    if (!target) return;

    const update = () => {
      const stageBox = stage.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      setHalo({
        x: targetBox.right - stageBox.left - Math.min(targetBox.width * 0.12, 38),
        y: targetBox.top - stageBox.top + targetBox.height * 0.52,
        visible: true,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [activeFocus, slide.id]);

  const focusClass = (id: string) =>
    cn(
      "deck-focus",
      activeFocus === id && "deck-focus-active",
      activeFocus !== null && activeFocus !== id && "deck-focus-receded",
    );

  return (
    <div ref={stageRef} className="deck-slide" data-kind={slide.kind}>
      <div
        className={cn("presenter-halo", halo.visible && "presenter-halo-visible")}
        style={{ transform: `translate3d(${halo.x}px, ${halo.y}px, 0)` }}
        aria-hidden
      >
        <span />
      </div>
      <SlideContent
        slide={slide}
        finding={finding}
        dataset={dataset}
        focusClass={focusClass}
      />
    </div>
  );
}

function SlideContent({
  slide,
  finding,
  dataset,
  focusClass,
}: {
  slide: Slide;
  finding: VerifiedFinding;
  dataset: DatasetSummary;
  focusClass: (id: string) => string;
}) {
  const evidenceIndex = slide.kind === "trap" ? Number(slide.id.split("-")[1] ?? 0) : 0;
  const provenEvidence = finding.grounding.schemaEvidence.filter(isProven);
  const evidence = provenEvidence[evidenceIndex] ?? null;

  if (slide.kind === "question") {
    return (
      <section className="deck-question">
        <h1 data-focus="question" className={focusClass("question")}>
          {slide.title}
        </h1>
        <div data-focus="file" className={cn("deck-question-meta", focusClass("file"))}>
          <p>I checked the shape of the data before touching the total.</p>
          <span>{slide.subtitle}</span>
        </div>
      </section>
    );
  }

  if (slide.kind === "headline") {
    return (
      <section className="deck-headline">
        <p className="deck-verified">Verified finding</p>
        <h1 data-focus="figure" className={cn("deck-figure", focusClass("figure"))}>
          {formatFigure(finding.value, finding.unit)}
        </h1>
        <div data-focus="claim" className={cn("deck-claim", focusClass("claim"))}>
          <p>{finding.claim}</p>
          <span>Computed by code · traced to source cells</span>
        </div>
      </section>
    );
  }

  if (slide.kind === "trap" && evidence) {
    return <TrapSlide evidence={evidence} focusClass={focusClass} />;
  }

  if (slide.kind === "code") {
    return (
      <section className="deck-code">
        <div data-focus="explanation" className={focusClass("explanation")}>
          <h1>The calculation is inspectable.</h1>
          <p>{finding.code.explanation}</p>
        </div>
        <pre data-focus="code" className={cn("deck-code-block", focusClass("code"))}>
          <code>
            {finding.code.source.split("\n").map((line, index) => (
              <span key={`${index}-${line}`}>
                <i>{String(index + 1).padStart(2, "0")}</i>
                {line}
              </span>
            ))}
          </code>
        </pre>
        <p data-focus="exit" className={cn("deck-code-meta", focusClass("exit"))}>
          {finding.code.lineCount} lines · Python · exit {finding.execution.exitCode} ·{" "}
          {finding.execution.durationMs} ms
        </p>
      </section>
    );
  }

  if (slide.kind === "cells") {
    return (
      <section className="deck-cells">
        <h1>The number returns to the rows.</h1>
        <div data-focus="columns" className={focusClass("columns")}>
          <CellsGrid cells={finding.grounding.sampleCells} />
        </div>
        <p data-focus="rows" className={cn("deck-cells-meta", focusClass("rows"))}>
          {formatCount(finding.grounding.sampleCells.length)} cells shown ·{" "}
          {formatCount(finding.grounding.rowCount)} rows read from {dataset.filename}
        </p>
      </section>
    );
  }

  return (
    <section className="deck-summary">
      <div className="deck-summary-head">
        <h1 data-focus="figure" className={cn("deck-summary-figure", focusClass("figure"))}>
          {formatFigure(finding.value, finding.unit)}
        </h1>
        <p data-focus="claim" className={cn("deck-summary-claim", focusClass("claim"))}>
          {finding.claim}
        </p>
      </div>
      <div data-focus="proof" className={cn("deck-summary-grid", focusClass("proof"))}>
        <ProofChart evidence={provenEvidence[0] ?? null} />
        <div className="deck-proof-counts">
          <ProofCount value={finding.grounding.rowCount} label="rows read" />
          <ProofCount
            value={provenEvidence[0]?.supportingRows ?? 0}
            label="schema proofs"
          />
        </div>
      </div>
      <div className="deck-benchmark">
        <strong>Pre-computed benchmark</strong>
        <span>Vera 100%</span>
        <span>baseline 47.6%</span>
        <em>Live: every number is computed and traceable.</em>
      </div>
    </section>
  );
}

function TrapSlide({
  evidence,
  focusClass,
}: {
  evidence: SchemaEvidence;
  focusClass: (id: string) => string;
}) {
  return (
    <section className="deck-trap">
      <h1 data-focus="claim" className={focusClass("claim")}>
        {evidence.claim.replace("OrderDate is DD/MM/YYYY", "The dates were day-first.")}
      </h1>
      <div data-focus="counts" className={cn("deck-trap-counts", focusClass("counts"))}>
        <div>
          <strong>{formatCount(evidence.supportingRows)}</strong>
          <span className="proof-bar proof-bar-full" />
          <p>cannot be months</p>
        </div>
        <div>
          <strong>{formatCount(evidence.contradictingRows)}</strong>
          <span className="proof-bar" />
          <p>argue otherwise</p>
        </div>
      </div>
      <div data-focus="method" className={cn("deck-trap-method", focusClass("method"))}>
        <p>{evidence.method}</p>
        <div>
          {evidence.examples.slice(0, 3).map((example) => (
            <code key={example}>{example}</code>
          ))}
        </div>
      </div>
    </section>
  );
}

function CellsGrid({ cells }: { cells: SourceCell[] }) {
  const rows = useMemo(() => {
    const grouped = new Map<number, SourceCell[]>();
    for (const cell of cells) grouped.set(cell.row, [...(grouped.get(cell.row) ?? []), cell]);
    return [...grouped.entries()].slice(0, 6);
  }, [cells]);
  const columns = [...new Set(cells.map((cell) => cell.column))];

  if (rows.length === 0) {
    return <p className="deck-empty-cells">The executed run recorded no preview cells.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Row</th>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([row, rowCells]) => (
          <tr key={row}>
            <td>{row + 1}</td>
            {columns.map((column) => (
              <td key={column}>
                {rowCells.find((cell) => cell.column === column)?.value ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProofChart({ evidence }: { evidence: SchemaEvidence | null }) {
  const support = evidence?.supportingRows ?? 0;
  const contradict = evidence?.contradictingRows ?? 0;
  const max = Math.max(support, contradict, 1);
  return (
    <div className="deck-proof-chart" role="img" aria-label={`${support} rows support the schema fact and ${contradict} contradict it`}>
      <p>{evidence?.claim ?? "Rows behind the answer"}</p>
      <div className="deck-proof-bars">
        {[
          { label: "Support", value: support, accent: true },
          { label: "Contradict", value: contradict, accent: false },
        ].map((bar) => (
          <div key={bar.label}>
            <span className={cn(bar.accent && "is-accent")} style={{ transform: `scaleY(${Math.max(bar.value / max, 0.015)})` }} />
            <strong>{formatCount(bar.value)}</strong>
            <small>{bar.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProofCount({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <strong>{formatCount(value)}</strong>
      <span>{label}</span>
    </div>
  );
}
