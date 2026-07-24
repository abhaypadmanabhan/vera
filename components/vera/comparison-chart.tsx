"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * The cold open's one chart: the same question answered two ways, on the same
 * scale. One series, two marks, both directly labelled — no legend, no
 * gridlines, no second axis. Colour never carries the meaning alone: each column
 * is named under its own mark and the numbers are printed on the caps.
 *
 * Both figures are recorded values computed from the real file (see
 * `tasks/checkpoints.md` CP-3). Nothing here is illustrative.
 */

export interface ComparisonBar {
  label: string;
  value: number;
  display: string;
  tone: "accent" | "danger";
}

export function ComparisonChart({ bars, caption }: { bars: ComparisonBar[]; caption: string }) {
  const reduced = useReducedMotion();
  const max = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <figure className="m-0">
      <div className="mx-auto h-[220px] w-full max-w-[400px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 28, right: 8, bottom: 0, left: 8 }}>
            <YAxis type="number" domain={[0, max * 1.12]} hide />
            <XAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 13 }}
              tickMargin={10}
            />
            <Bar
              dataKey="value"
              barSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reduced}
              animationDuration={600}
              animationEasing="ease-out"
            >
              {bars.map((bar) => (
                <Cell
                  key={bar.label}
                  fill={bar.tone === "danger" ? "var(--color-danger)" : "var(--color-accent)"}
                />
              ))}
              <LabelList
                dataKey="display"
                position="top"
                offset={10}
                fill="var(--color-ink)"
                fontSize={14}
                fontFamily="var(--font-mono)"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-3 text-micro text-ink-muted">{caption}</figcaption>

      {/* Text alternative — the chart is never the only place a number lives. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.label}>
              <th scope="row">{bar.label}</th>
              <td>{bar.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
