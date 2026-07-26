"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Deck, Slide } from "@/lib/deck";
import { evidenceHeadline, matchSlide } from "@/lib/deck";
import { isProven } from "@/lib/types";
import type { DatasetSummary, Finding, SchemaEvidence, SourceCell } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatCount, formatFigure } from "./format";
import { PresenterOrb } from "./presenter-orb";
import { useNarrationAudio } from "./use-narration-audio";

const NARRATION_TIMING = {
  beatMs: 1_650,
  transitionMs: 260,
} as const;

type VerifiedFinding = Extract<Finding, { verdict: "verified" }>;

export type DeckBenchmark = {
  veraPercent: number;
  baselinePercent: number;
  dashboardUrl: string;
  baselineMisses: string[];
};

const PRESENTER_RADIUS = 60;
const PRESENTER_GAP = 16;
const PRESENTER_EDGE = 16;

export function needsFallbackPacing(
  slide: Slide | undefined,
  voiceAvailable: boolean,
): boolean {
  return slide !== undefined && (slide.beats.length === 0 || !voiceAvailable);
}

export function presenterPosition(
  stage: { left: number; top: number; width: number; height: number },
  target: { left: number; right: number; top: number; height: number },
): { x: number; y: number } {
  const targetLeft = target.left - stage.left;
  const targetRight = target.right - stage.left;
  const right = targetRight + PRESENTER_RADIUS + PRESENTER_GAP;
  const left = targetLeft - PRESENTER_RADIUS - PRESENTER_GAP;
  const min = PRESENTER_RADIUS + PRESENTER_EDGE;
  const maxX = stage.width - min;
  const maxY = stage.height - min;
  const x = right <= maxX ? right : left >= min ? left : maxX;
  const y = Math.max(min, Math.min(target.top - stage.top + target.height * 0.5, maxY));
  return { x, y };
}

export function DeckPlayer({
  deck,
  finding,
  dataset,
  benchmark,
  isMock,
  suggestedFollowUps = [],
  onNewQuestion,
}: {
  deck: Deck;
  finding: VerifiedFinding;
  dataset: DatasetSummary;
  benchmark: DeckBenchmark;
  isMock: boolean;
  /** Questions Vera can answer next, derived from the columns she just read. */
  suggestedFollowUps?: string[];
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
  // Every beat of the slide goes to /api/speak in ONE request; the audio hook
  // walks the beats along the returned clip and calls `advance` per beat.
  const spokenBeats =
    narrating && slide && slide.beats.length > 0
      ? slide.beats.map((beat) => beat.spoken)
      : null;

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
    texts: spokenBeats,
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
    if (!narrating || !needsFallbackPacing(slide, voiceAvailable)) return;
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
              benchmark={benchmark}
              activeFocus={null}
              speaking={false}
              narrating={false}
            />
          </div>
        )}
        <div key={slide.id} className="deck-layer deck-layer-in">
          <DeckSlide
            slide={slide}
            finding={finding}
            dataset={dataset}
            benchmark={benchmark}
            activeFocus={focus}
            speaking={veraSpeaking}
            narrating={narrating}
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

        <div className="deck-footer-left">
          <div className="deck-status" aria-live="polite" aria-atomic="true">
            <span className="font-mono tabular-nums">
              {String(slideIndex + 1).padStart(2, "0")} / {String(deck.slides.length).padStart(2, "0")}
            </span>
            <span>{narrating ? slide.beats[activeBeat]?.spoken : "Use ← → or the rail to revisit"}</span>
            {veraSpeaking ? <span className="sr-only">Vera is speaking</span> : null}
          </div>

          {/*
            Suggestions, not answers. Each one is already checked against the
            guardrail, so clicking it always runs — a suggestion Vera then
            refuses would be worse than none at all.
          */}
          {!narrating && suggestedFollowUps.length > 0 && (
            <div className="deck-suggestions">
              <span className="deck-suggestions-label">You might also ask</span>
              {suggestedFollowUps.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onNewQuestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
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
  benchmark,
  activeFocus,
  speaking = false,
  narrating = true,
}: {
  slide: Slide;
  finding: VerifiedFinding;
  dataset: DatasetSummary;
  benchmark?: DeckBenchmark;
  activeFocus: string | null;
  speaking?: boolean;
  narrating?: boolean;
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
      const position = presenterPosition(stageBox, targetBox);
      setHalo({
        x: position.x,
        y: position.y,
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
      <PresenterOrb
        state={speaking ? "speaking" : narrating ? "idle" : "stopped"}
        visible={halo.visible}
        x={halo.x}
        y={halo.y}
      />
      <SlideContent
        slide={slide}
        finding={finding}
        dataset={dataset}
        benchmark={benchmark}
        focusClass={focusClass}
      />
    </div>
  );
}

function SlideContent({
  slide,
  finding,
  dataset,
  benchmark,
  focusClass,
}: {
  slide: Slide;
  finding: VerifiedFinding;
  dataset: DatasetSummary;
  benchmark?: DeckBenchmark;
  focusClass: (id: string) => string;
}) {
  const evidenceIndex = slide.kind === "caveat" ? Number(slide.id.split("-")[1] ?? 0) : 0;
  const provenEvidence = finding.grounding.schemaEvidence.filter(isProven);
  const evidence = provenEvidence[evidenceIndex] ?? null;

  if (slide.kind === "opener") {
    return (
      <section className="deck-question">
        <h1 data-focus="question" className={focusClass("question")}>
          {slide.title}
        </h1>
        <div data-focus="file" className={cn("deck-question-meta", focusClass("file"))}>
          <p>{slide.spoken}</p>
          <span>{slide.subtitle}</span>
        </div>
      </section>
    );
  }

  if (slide.kind === "finding") {
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

  if (slide.kind === "meaning") {
    const focusNames = ["primary", "secondary", "tertiary"] as const;
    return (
      <section className="deck-summary">
        <div className="deck-summary-head">
          <p className="deck-verified">Grounded comparison</p>
          <h1>{slide.title}</h1>
        </div>
        <div className="deck-proof-counts">
          {finding.context.map((figure, index) => {
            const focus = focusNames[index] ?? "tertiary";
            return (
              <div
                key={figure.name}
                data-focus={focus}
                className={focusClass(focus)}
              >
                <strong>{formatFigure(figure.value, null)}</strong>
                <p>{figure.description}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (slide.kind === "caveat" && evidence) {
    return <CaveatSlide evidence={evidence} focusClass={focusClass} />;
  }

  if (slide.kind === "working") {
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
        <div data-focus="columns" className={focusClass("columns")}>
          <CellsGrid cells={finding.grounding.sampleCells} />
        </div>
        <p data-focus="rows" className={cn("deck-cells-meta", focusClass("rows"))}>
          {formatCount(finding.grounding.sampleCells.length)} cells shown ·{" "}
          {formatCount(finding.grounding.rowCount)} rows read from {dataset.filename}
        </p>
        {provenEvidence.map((item) => (
          <div key={item.claim} className="deck-trap-method">
            <p>{item.claim}</p>
            <p>{item.method}</p>
          </div>
        ))}
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
      {/*
        Agreement counts exist only for a proven deterministic claim about the
        schema. Most questions rest on none, which is normal — and rendering that
        as "0 rows that agree" beneath a verified figure reads as the data
        disagreeing with the answer. Grounded or absent, same as context figures.
      */}
      <div data-focus="proof" className={cn("deck-summary-grid", focusClass("proof"))}>
        {provenEvidence[0] ? (
          <>
            <ProofChart evidence={provenEvidence[0]} />
            <div className="deck-proof-counts">
              <ProofCount value={finding.grounding.rowCount} label="rows read" />
              <ProofCount
                value={provenEvidence[0].supportingRows}
                label="rows that agree"
              />
            </div>
          </>
        ) : (
          <div className="deck-proof-counts">
            <ProofCount value={finding.grounding.rowCount} label="rows read" />
            <ProofCount
              value={finding.grounding.sampleCells.length}
              label="cells quoted back"
            />
          </div>
        )}
      </div>
      {benchmark && <BenchmarkPanel benchmark={benchmark} />}
    </section>
  );
}

function BenchmarkPanel({ benchmark }: { benchmark: DeckBenchmark }) {
  return (
    <details className="deck-benchmark">
      <summary>
        <strong>Pre-computed aggregate benchmark</strong>
        <span>Vera {benchmark.veraPercent}%</span>
        <span>baseline {benchmark.baselinePercent}%</span>
        <em>View misses and Braintrust run</em>
      </summary>
      <div className="deck-benchmark-panel">
        <p>What the no-execution baseline missed</p>
        <ul>
          {benchmark.baselineMisses.map((miss) => (
            <li key={miss}>{miss}</li>
          ))}
        </ul>
        <a href={benchmark.dashboardUrl} target="_blank" rel="noreferrer">
          Open the Braintrust dashboard <span aria-hidden>↗</span>
        </a>
        <small>
          Pre-computed aggregate benchmark, not a per-answer guarantee. Live, every displayed
          number is computed and traceable.
        </small>
      </div>
    </details>
  );
}

function CaveatSlide({
  evidence,
  focusClass,
}: {
  evidence: SchemaEvidence;
  focusClass: (id: string) => string;
}) {
  return (
    <section className="deck-trap">
      <h1 data-focus="claim" className={focusClass("claim")}>
        One thing changes the answer.
      </h1>
      <div
        data-focus="consequence"
        className={cn("deck-trap-method", focusClass("consequence"))}
      >
        <p>Taken at face value, the result would have been badly wrong.</p>
        <p>
          The check held across every value used
          {evidence.contradictingRows === 0 ? ", with nothing arguing otherwise." : "."}
        </p>
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
    <div
      className="deck-proof-chart"
      role="img"
      aria-label={`${support} rows agree with the check behind this answer and ${contradict} argue otherwise`}
    >
      <p>{evidenceHeadline(evidence)}</p>
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
