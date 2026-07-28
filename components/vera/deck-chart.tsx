"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ContextFigure, SchemaEvidence } from "@/lib/types";
import { formatCount, formatFigure } from "./format";
import { useReducedMotion } from "./use-reduced-motion";

/*
 * The deck's charts. Built against the `dataviz` skill:
 *
 *   - Form follows the job. Magnitude across a few named things → bars.
 *     Coverage of a whole → one meter, not a pie. A count and its zero
 *     counterpart → two stat tiles, because a bar of 0 is not a chart.
 *   - ONE series, so no legend: the title names it. Emphasis (the answer) is
 *     carried by the accent, everything it is measured against stays in the
 *     recessive hairline colour. Colour follows the entity, never its rank.
 *   - Every bar is direct-labelled, so no value is colour-or-hover-only, and a
 *     screen-reader table carries the same numbers.
 *   - Text wears ink tokens. Only the marks wear the accent.
 *
 * Honesty (PRD §6): nothing here computes, smooths or infers a value. Every
 * number plotted was produced by the executed run and arrives as a
 * `ContextFigure` or a counted row total.
 */

/** The most bars a deck slide can carry before it stops reading from a distance. */
const MAX_BARS = 5;

/**
 * How far apart two figures may be and still share one axis.
 *
 * Plotting a total against an average is the dual-axis anti-pattern wearing a
 * single axis: the small bar collapses to a hairline and the chart says nothing.
 * When the spread is wider than this the slide shows stat tiles instead — which
 * is the honest answer, not a degraded one.
 */
const MAX_SPREAD = 100;

export interface Bar_ {
  label: string;
  value: number;
  /** The answer itself, as opposed to something it is measured against. */
  isAnswer: boolean;
}

/**
 * Decide whether the headline figure and its context can share one axis, and
 * return the bars if they can. Returns null whenever a chart would mislead:
 * a non-numeric figure, fewer than two bars, mixed signs, or too wide a spread.
 */
export function contextSeries(
  value: number | string,
  context: readonly ContextFigure[],
  claimLabel: string,
): Bar_[] | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const comparable = context.filter(
    (figure): figure is ContextFigure & { value: number } =>
      typeof figure.value === "number" && Number.isFinite(figure.value),
  );
  if (comparable.length === 0) return null;

  /*
   * Keep the figures that can share an axis WITH THE ANSWER, and let the rest
   * be stated as tiles beside the chart.
   *
   * This used to be all-or-nothing, and the first live run showed why that was
   * wrong: the real context was a prior-period total (130,259.58), a percentage
   * change (+10.4) and a share (6.3). One figure out of scale killed the whole
   * chart, even though the answer and the prior period are the same quantity a
   * year apart — the single most useful comparison on the slide.
   */
  const sameSign = (figure: number) => (value >= 0 ? figure >= 0 : figure <= 0);
  const inScale = (figure: number) => {
    const a = Math.abs(value);
    const b = Math.abs(figure);
    if (a === 0 || b === 0) return false;
    return Math.max(a, b) / Math.min(a, b) <= MAX_SPREAD;
  };

  const bars: Bar_[] = [
    { label: claimLabel, value, isAnswer: true },
    ...comparable
      .filter((figure) => sameSign(figure.value) && inScale(figure.value))
      .slice(0, MAX_BARS - 1)
      .map((figure) => ({ label: figure.description, value: figure.value, isAnswer: false })),
  ];

  // One bar is not a comparison. Below that the slide states the figures instead.
  if (bars.length < 2) return null;
  if (Math.abs(value) === 0) return null;

  return bars;
}

/*
 * The clip lives on a wrapper `div`, never on the `<table>`: a table ignores
 * `width: 1px` and lays out at min-content, so `sr-only` applied directly to it
 * leaves a several-hundred-pixel box hanging past the viewport edge.
 */
function TextAlternative({ caption, bars, unit }: { caption: string; bars: Bar_[]; unit: string | null }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.label}>
              <th scope="row">{bar.label}</th>
              <td>{formatFigure(bar.value, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The comparison that makes the headline number mean something: the answer set
 * beside the grounded figures the same run produced.
 */
export function ContextChart({
  title,
  bars,
  unit,
}: {
  title: string;
  bars: Bar_[];
  unit: string | null;
}) {
  const reduced = useReducedMotion();
  const data = useMemo(
    () => bars.map((bar) => ({ ...bar, tip: formatFigure(bar.value, unit) })),
    [bars, unit],
  );
  const domainMax = useMemo(
    () => Math.max(...data.map((row) => Math.abs(row.value)), 1) * 1.32,
    [data],
  );

  return (
    <figure className="deck-chart">
      <figcaption>{title}</figcaption>
      <div className="deck-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 2, right: 8, bottom: 2, left: 0 }}
            barCategoryGap="26%"
          >
            <XAxis type="number" domain={[0, domainMax]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={196}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 15 }}
            />
            <Tooltip
              cursor={false}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                borderRadius: 10,
                fontSize: 15,
                color: "var(--color-ink)",
              }}
              formatter={(figure) =>
                typeof figure === "number" ? [formatFigure(figure, unit), ""] : ["—", ""]
              }
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              minPointSize={2}
              isAnimationActive={!reduced}
              animationDuration={520}
              animationEasing="ease-out"
            >
              {data.map((row) => (
                <Cell
                  key={row.label}
                  fill={row.isAnswer ? "var(--color-accent)" : "var(--color-line-strong)"}
                />
              ))}
              <LabelList
                dataKey="tip"
                position="right"
                offset={12}
                fill="var(--color-ink)"
                fontSize={16}
                fontFamily="var(--font-mono)"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TextAlternative caption={title} bars={bars} unit={unit} />
    </figure>
  );
}

/**
 * How much of the file the executed code actually read.
 *
 * One quantity as a share of a whole, so it is a meter and not a chart: a single
 * track with the read portion filled, the real counts direct-labelled beside it.
 */
export function CoverageMeter({
  rowsRead,
  rowsInFile,
  filename,
}: {
  rowsRead: number;
  rowsInFile: number;
  filename: string;
}) {
  const whole = Math.max(rowsInFile, rowsRead, 1);
  const share = Math.min(rowsRead / whole, 1);

  return (
    <figure
      className="deck-meter"
      role="img"
      aria-label={`The executed code read ${formatCount(rowsRead)} of ${formatCount(
        rowsInFile,
      )} rows in ${filename}.`}
    >
      <figcaption>Rows read by the executed code</figcaption>
      <p className="deck-meter-figure">
        <strong>{formatCount(rowsRead)}</strong>
        <span>of {formatCount(rowsInFile)}</span>
      </p>
      <span className="deck-meter-track" aria-hidden>
        <span className="deck-meter-fill" style={{ inlineSize: `${share * 100}%` }} />
      </span>
    </figure>
  );
}

/**
 * The agreement behind a schema fact, as two tiles rather than two bars.
 *
 * The contradicting count is almost always zero, and a bar of zero draws
 * nothing — so the most important number in the pair would be the one that
 * vanished. Tiles show it. State is carried by the mark's FORM (a filled tick
 * against a hollow ring), so the pair still reads without colour.
 */
export function EvidenceStats({ evidence }: { evidence: SchemaEvidence }) {
  const clean = evidence.contradictingRows === 0;

  return (
    <div className="deck-evidence">
      <div className="deck-evidence-stat" data-tone="support">
        <span className="deck-evidence-mark" aria-hidden>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3.5 8.4 6.6 11.5 12.5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <strong>{formatCount(evidence.supportingRows)}</strong>
        <p>rows that agree — they can only be explained by the check she ran</p>
      </div>
      <div className="deck-evidence-stat" data-tone={clean ? "empty" : "against"}>
        <span className="deck-evidence-mark" aria-hidden>
          {clean ? (
            <svg viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="4.6" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 3.6v5.2M8 12.1h.01"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
        <strong>{formatCount(evidence.contradictingRows)}</strong>
        <p>{clean ? "argue otherwise — nothing in the file disagrees" : "argue otherwise"}</p>
      </div>
    </div>
  );
}
