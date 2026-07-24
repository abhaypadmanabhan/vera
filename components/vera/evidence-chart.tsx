"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { SchemaEvidence } from "@/lib/types";
import { formatCount } from "./format";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * The one chart on the finding screen.
 *
 * It plots the only series the contract actually carries: the counted rows
 * behind each schema fact the analysis relied on — how many rows can only be
 * explained by the claim, and how many argue against it (`SchemaEvidence`).
 * Both numbers come from the deterministic profiler, so the chart is as
 * traceable as the headline number above it. Nothing here is modelled,
 * smoothed or inferred; a bar is a row count.
 *
 * Design: two marks, one series, direct labels on both tips, no legend (a single
 * series is named by the title), no gridlines. Colours are the validated pair —
 * accent for rows that prove the claim, danger for rows that argue against it —
 * and they never carry meaning alone: each bar is labelled in words and in
 * digits, and the same two numbers sit in the table alternative below.
 */

interface Row {
  label: string;
  value: number;
  tone: "accent" | "danger";
}

/**
 * A zero row would draw no rectangle at all, and Recharts hangs its labels off
 * the rectangle — so the most important number in this chart ("0 rows argue
 * otherwise") would silently vanish. `minPointSize` keeps a 2px stub so the
 * label has something to sit beside, and a zero stub is drawn in the hairline
 * colour rather than the series colour so it reads as an empty track, never as
 * a small amount of contrary evidence.
 */
function RowBars({ rows, domainMax }: { rows: Row[]; domainMax: number }) {
  const reduced = useReducedMotion();
  const data = rows.map((row) => ({ ...row, tip: formatCount(row.value) }));

  return (
    <div className="h-[112px] w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 0 }}
          barCategoryGap={18}
        >
          <XAxis type="number" domain={[0, domainMax]} hide />
          <YAxis
            type="category"
            dataKey="label"
            width={168}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 13 }}
          />
          <Bar
            dataKey="value"
            barSize={20}
            minPointSize={2}
            radius={[0, 4, 4, 0]}
            isAnimationActive={!reduced}
            animationDuration={600}
            animationEasing="ease-out"
          >
            {data.map((row) => (
              <Cell
                key={row.label}
                fill={
                  row.value === 0
                    ? "var(--color-line-strong)"
                    : row.tone === "danger"
                      ? "var(--color-danger)"
                      : "var(--color-accent)"
                }
              />
            ))}
            <LabelList
              dataKey="tip"
              position="right"
              offset={10}
              fill="var(--color-ink)"
              fontSize={13}
              fontFamily="var(--font-mono)"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TextAlternative({ caption, rows }: { caption: string; rows: Row[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{formatCount(row.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EvidenceChart({ evidence }: { evidence: SchemaEvidence }) {
  const rows: Row[] = [
    { label: "Rows that prove it", value: evidence.supportingRows, tone: "accent" },
    { label: "Rows against it", value: evidence.contradictingRows, tone: "danger" },
  ];

  return (
    <figure className="m-0">
      <figcaption className="max-w-[68ch] text-small text-ink-muted">{evidence.method}</figcaption>
      <div className="mt-4">
        <RowBars
          rows={rows}
          domainMax={Math.max(evidence.supportingRows, evidence.contradictingRows, 1)}
        />
      </div>
      <TextAlternative caption={evidence.claim} rows={rows} />
    </figure>
  );
}

/**
 * Fallback when the run carried no proven schema fact: plot the coverage the
 * safeguard did record — how many of the file's rows the executed code read.
 * Still a real count, never an estimate.
 */
export function CoverageChart({ rowsRead, rowsInFile }: { rowsRead: number; rowsInFile: number }) {
  const rows: Row[] = [
    { label: "Rows the code read", value: rowsRead, tone: "accent" },
    { label: "Rows untouched", value: Math.max(rowsInFile - rowsRead, 0), tone: "danger" },
  ];

  return (
    <figure className="m-0">
      <figcaption className="max-w-[68ch] text-small text-ink-muted">
        Of {formatCount(rowsInFile)} rows in the file, the executed code read {formatCount(rowsRead)}.
      </figcaption>
      <div className="mt-4">
        <RowBars rows={rows} domainMax={Math.max(rowsInFile, 1)} />
      </div>
      <TextAlternative caption="Rows behind this number" rows={rows} />
    </figure>
  );
}
