"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Deck, Slide } from "@/lib/deck";
import { matchSlide } from "@/lib/deck";
import { isProven } from "@/lib/types";
import type { DatasetSummary, Finding, SchemaEvidence, SourceCell } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContextChart, CoverageMeter, EvidenceStats, contextSeries } from "./deck-chart";
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
  /*
   * Focus exists to follow the voice. The moment narration stops it must clear:
   * `activeBeat` resets to 0 on every slide change, so a stopped deck used to
   * hold beat 0's focus forever and render the rest of the slide at 30% — the
   * reader was left staring at a greyed-out page they were now free to read.
   */
  const focus = narrating ? (slide?.beats[activeBeat]?.focus ?? null) : null;
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
              finding={
                deck.findings?.[deck.slides[previousIndex]?.findingIndex ?? 0] ?? finding
              }
              findings={deck.findings}
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
            finding={deck.findings?.[slide.findingIndex ?? 0] ?? finding}
            findings={deck.findings}
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

        <div className="deck-controls">
          <div className="deck-footer-left">
            <div className="deck-status" aria-live="polite" aria-atomic="true">
              <span>
                {String(slideIndex + 1).padStart(2, "0")} /{" "}
                {String(deck.slides.length).padStart(2, "0")}
              </span>
              <span>
                {narrating ? slide.beats[activeBeat]?.spoken : "Use ← → or the rail to revisit"}
              </span>
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
                  <button key={suggestion} type="button" onClick={() => onNewQuestion(suggestion)}>
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
        </div>
      </footer>
    </main>
  );
}

export function DeckSlide({
  slide,
  finding,
  findings,
  dataset,
  benchmark,
  activeFocus,
  speaking = false,
  narrating = true,
}: {
  slide: Slide;
  finding: VerifiedFinding;
  /** Every verified finding in the deck. Only set on a multi-finding deck. */
  findings?: readonly VerifiedFinding[];
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
        findings={findings}
        dataset={dataset}
        benchmark={benchmark}
        focusClass={focusClass}
      />
    </div>
  );
}

/**
 * The marker above a slide title. Sentence-case, in the UI face — never an
 * uppercase mono kicker. "Verified" carries its state in the mark's FORM as
 * well as its colour, so it survives being read in greyscale.
 */
function Marker({ children, verified = false }: { children: string; verified?: boolean }) {
  return (
    <p className={cn("deck-marker", verified && "deck-marker-verified")}>
      {verified && (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M6.4 10.3 8.9 12.8 13.6 7.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {children}
    </p>
  );
}

/**
 * The receipt under a NARRATED slide: what she is claiming, and how much of the
 * file she read to claim it.
 *
 * Deliberately not the full technical receipt. A narrated slide carries no
 * filename, no exit code and no timing — those are jargon, they belong on the
 * working slide, and `tests/deck-ui.test.ts` holds this line for the whole deck.
 */
function RunNote({ finding, lead }: { finding: VerifiedFinding; lead: string }) {
  return (
    <p className="deck-note">
      <span>{lead}</span>
      <span className="deck-note-tech">
        {formatCount(finding.grounding.rowCount)} rows read
      </span>
    </p>
  );
}

function SlideContent({
  slide,
  finding,
  findings,
  dataset,
  benchmark,
  focusClass,
}: {
  slide: Slide;
  finding: VerifiedFinding;
  findings?: readonly VerifiedFinding[];
  dataset: DatasetSummary;
  benchmark?: DeckBenchmark;
  focusClass: (id: string) => string;
}) {
  // Caveat ids are `caveat-N` on a single-finding deck and `caveat-F-N` on a
  // multi-finding one; the evidence index is always the LAST segment.
  const evidenceIndex =
    slide.kind === "caveat" ? Number(slide.id.split("-").at(-1) ?? 0) : 0;
  const provenEvidence = finding.grounding.schemaEvidence.filter(isProven);
  const evidence = provenEvidence[evidenceIndex] ?? null;

  if (slide.kind === "opener") {
    return (
      <section className="deck-canvas">
        <header className="deck-head">
          <Marker>The question</Marker>
        </header>
        <div className="deck-body">
          <h1 data-focus="question" className={cn("deck-question", focusClass("question"))}>
            {slide.title}
          </h1>
          <p data-focus="file" className={cn("deck-question-lede", focusClass("file"))}>
            {slide.spoken}
          </p>
        </div>
        <p className="deck-note">
          <span className="deck-note-tech">{slide.subtitle}</span>
        </p>
      </section>
    );
  }

  if (slide.kind === "finding") {
    return (
      <section className="deck-canvas">
        <header className="deck-head">
          <Marker verified>Verified finding</Marker>
        </header>
        <div className="deck-body">
          <h1 data-focus="figure" className={cn("deck-figure", focusClass("figure"))}>
            {formatFigure(finding.value, finding.unit)}
          </h1>
          <p data-focus="claim" className={cn("deck-claim", focusClass("claim"))}>
            {finding.claim}
          </p>
        </div>
        <RunNote finding={finding} lead="Computed by code, traced to source cells" />
      </section>
    );
  }

  if (slide.kind === "meaning") {
    const focusNames = ["primary", "secondary", "tertiary"] as const;
    /*
     * The chart appears only when the headline and its context can honestly
     * share one axis. When they cannot, the same figures are stated as tiles —
     * which is the right answer, not a degraded one. Either way the tiles carry
     * the narration's focus targets, so the presenter walks them one at a time
     * while the chart stays put.
     */
    const bars = contextSeries(finding.value, finding.context, "This answer");
    return (
      <section className="deck-canvas">
        <header className="deck-head">
          <Marker>Grounded comparison</Marker>
          <h1 className="deck-title">{slide.title}</h1>
        </header>
        <div className={cn("deck-body", bars && "deck-meaning")}>
          {bars && (
            <ContextChart
              title="The answer, and what it was measured against"
              bars={bars}
              unit={finding.unit}
            />
          )}
          {/*
            Beside a chart these stop repeating the figures — the bars already
            carry them, direct-labelled — and become the provenance line for
            each one. They stay the narration's focus anchors either way.

            The figures are always rendered and hidden in CSS rather than
            dropped here, because on a narrow stage the chart is the thing that
            gives way: a 390px plot cannot hold a category label and a value
            label, so `deck.css` swaps to these tiles instead of clipping the
            numbers. Same markup, no viewport branch in React, no hydration seam.
          */}
          <div className={cn("deck-figures", bars && "deck-figures-annotated")}>
            {finding.context.map((figure, index) => {
              const focus = focusNames[index] ?? "tertiary";
              return (
                <div key={figure.name} data-focus={focus} className={focusClass(focus)}>
                  <strong>{formatFigure(figure.value, finding.unit)}</strong>
                  <p>{figure.description}</p>
                  <span>{figure.columnsUsed.join(" · ")}</span>
                </div>
              );
            })}
          </div>
        </div>
        <RunNote finding={finding} lead="Every figure here came out of the same executed run" />
      </section>
    );
  }

  if (slide.kind === "caveat" && evidence) {
    return (
      <CaveatSlide evidence={evidence} finding={finding} focusClass={focusClass} />
    );
  }

  if (slide.kind === "working") {
    const cells = finding.grounding.sampleCells;
    return (
      <section className="deck-canvas">
        <header className="deck-head">
          <Marker>The working</Marker>
          <h1 data-focus="explanation" className={cn("deck-title", focusClass("explanation"))}>
            The calculation is inspectable.
          </h1>
          <p className="deck-work-lede">{finding.code.explanation}</p>
        </header>
        {/*
          Two independently scrolling panels. A long program or a wide table
          scrolls inside its own column; neither can grow the row and land on
          top of the other, which is what the old three-row grid allowed.
        */}
        <div className="deck-body deck-work">
          <div data-focus="code" className={cn("deck-work-panel", focusClass("code"))}>
            <h2>The program she ran</h2>
            <div className="deck-scroll">
              <pre className="deck-code-block">
                <code>
                  {finding.code.source.split("\n").map((line, index) => (
                    <span key={`${index}-${line}`}>
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      {line}
                    </span>
                  ))}
                </code>
              </pre>
            </div>
          </div>
          <div
            data-focus="columns"
            className={cn("deck-work-panel deck-work-cells", focusClass("columns"))}
          >
            <h2>The cells it read</h2>
            <div className="deck-scroll">
              <CellsGrid cells={cells} />
              {provenEvidence.slice(0, 2).map((item) => (
                <div key={item.claim} className="deck-method">
                  <p>{item.claim}</p>
                  <p>{item.method}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="deck-note">
          <span className="deck-note-tech">
            {finding.code.lineCount} lines · Python · exit {finding.execution.exitCode} ·{" "}
            {formatCount(finding.execution.durationMs)} ms
          </span>
          <span className="deck-note-tech">
            {formatCount(cells.length)} cells shown ·{" "}
            {formatCount(finding.grounding.rowCount)} rows read from {dataset.filename}
          </span>
        </p>
      </section>
    );
  }

  /*
   * The multi-finding summary: every verified figure, each with its own claim
   * and its own row count — repeated, never derived. A figure appears here
   * only because its own executed run produced it; a finding that failed to
   * verify is not in `findings` and simply does not appear.
   */
  if (slide.kind === "summary" && findings && findings.length > 1) {
    return (
      <section className="deck-canvas">
        <header className="deck-head">
          <Marker verified>Verified findings</Marker>
          <h1 className="deck-title">{slide.title}</h1>
        </header>
        <div className="deck-body">
          <div className="deck-figures">
            {findings.map((item, index) => {
              const focus = `figure-${index}`;
              return (
                <div key={`${index}-${item.claim}`} data-focus={focus} className={focusClass(focus)}>
                  <strong>{formatFigure(item.value, item.unit)}</strong>
                  <p>{item.claim}</p>
                  <span>{formatCount(item.grounding.rowCount)} rows read</span>
                </div>
              );
            })}
          </div>
        </div>
        <div data-focus="proof" className={cn("deck-note", focusClass("proof"))}>
          <span>Every figure computed by code and traced to source cells.</span>
          {benchmark && <BenchmarkPanel benchmark={benchmark} />}
        </div>
      </section>
    );
  }

  return (
    <section className="deck-canvas">
      <header className="deck-head">
        <Marker verified>Verified finding</Marker>
      </header>
      <div className="deck-body deck-body-split">
        <div>
          <h1 data-focus="figure" className={cn("deck-summary-figure", focusClass("figure"))}>
            {formatFigure(finding.value, finding.unit)}
          </h1>
          <p data-focus="claim" className={cn("deck-summary-claim", focusClass("claim"))}>
            {finding.claim}
          </p>
        </div>
        {/*
          Coverage is true of every run, so it is always the first proof shown.
          Agreement counts exist only for a PROVEN deterministic claim about the
          schema; most questions rest on none, and printing "0 rows that agree"
          under a verified figure would read as the data disagreeing with the
          answer. Grounded or absent, same rule as the context figures.
        */}
        <div data-focus="proof" className={cn("deck-summary-proof", focusClass("proof"))}>
          <CoverageMeter
            rowsRead={finding.grounding.rowCount}
            rowsInFile={dataset.rowCount}
            filename={dataset.filename}
          />
          {provenEvidence[0] && <EvidenceStats evidence={provenEvidence[0]} />}
        </div>
      </div>
      {benchmark && (
        <div className="deck-note">
          <BenchmarkPanel benchmark={benchmark} />
        </div>
      )}
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

/**
 * The trap slide. It states the CONSEQUENCE and shows how much of the file
 * agreed — never the column name or the format, which are technical details and
 * live on the working slide where they belong.
 */
function CaveatSlide({
  evidence,
  finding,
  focusClass,
}: {
  evidence: SchemaEvidence;
  finding: VerifiedFinding;
  focusClass: (id: string) => string;
}) {
  return (
    <section className="deck-canvas">
      <header className="deck-head">
        <Marker>Worth knowing</Marker>
        <h1 data-focus="claim" className={cn("deck-title-lg", focusClass("claim"))}>
          One thing changes the answer.
        </h1>
      </header>
      <div className="deck-body deck-body-split">
        <div
          data-focus="consequence"
          className={cn("deck-trap-lede", focusClass("consequence"))}
        >
          <p>
            Taken at face value, the result would have been badly wrong — and nothing on screen
            would have warned you.
          </p>
          <p>
            She checked it against every value the answer rests on before using it
            {evidence.contradictingRows === 0 ? ", and they all agree." : "."}
          </p>
        </div>
        <EvidenceStats evidence={evidence} />
      </div>
      <RunNote finding={finding} lead="Checked before the figure was released" />
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
    <table className="deck-cells-table">
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
