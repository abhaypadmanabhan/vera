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
      {/*
        This is the punchline of the cold open and it gets the stage: the whole
        column, and enough height that the difference between the two marks is
        legible from across a room.
      */}
      <div
        className="mx-auto w-full max-w-[38rem]"
        style={{ height: "clamp(15rem, 40vh, 24rem)" }}
        aria-hidden
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 36, right: 8, bottom: 0, left: 8 }}>
            <YAxis type="number" domain={[0, max * 1.12]} hide />
            {/*
              `height` has to be given explicitly: the axis defaults to 30px,
              which is not enough for a 16px tick plus its margin, and the
              column names were being sliced through the middle.
            */}
            <XAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              height={46}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 16 }}
              tickMargin={14}
            />
            <Bar
              dataKey="value"
              barSize={64}
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
                offset={12}
                fill="var(--color-ink)"
                fontSize={19}
                fontFamily="var(--font-mono)"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-4 text-center text-small text-ink-muted">{caption}</figcaption>

      {/*
        Text alternative — the chart is never the only place a number lives.
        The clip lives on a wrapper `div`, not on the table: a table ignores
        `width: 1px` and lays out at min-content, so `sr-only` on the table
        itself leaves a ~630px box hanging past the right edge of the viewport.
      */}
      <div className="sr-only">
        <table>
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
      </div>
    </figure>
  );
}
