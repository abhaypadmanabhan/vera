# DESIGN.md — Vera

**v3.** Written from the builder's direct spec. It supersedes v2 (the auditor / red-pen evidence
document) entirely — where they conflict, **v3 wins**. Read the builder's vault at
`/Users/abhayp/Documents/Obsidian Vault/UI-UX/` before building, and use the **Mobbin MCP**
(`search_screens`, `search_flows`, `search_sections`) for real reference screens.

---

## The brief, in the builder's words

> Apple-clean. One tight design system, generous whitespace, a real type scale, minimal colour. No
> jargon, no walls of text. Every answer is a crisp headline number, one clean chart, and a one-line
> source — not a paragraph. **The hero screen must look expensive.**

One flawless flow beats five rough ones. Do not over-scope.

## Aesthetic

Apple-clean: calm surfaces, generous negative space, one accent, type doing the work. Nothing
decorative. If an element does not carry information or afford an action, delete it.

**Anti-goals — reject on sight:** dark glassmorphism · gradient mesh · neon-on-charcoal · dense
dashboards with six cards above the fold · walls of explanatory text · spinners · emoji · any
screen that would look identical with a different product's copy in it.

## Colour — minimal, and it means something

Light is the primary mode. Dark must work too, because charts have to read consistently in both
(`prefers-color-scheme` + a `data-theme` override). Swap token values, never component code.

```css
/* light */
--bg:          oklch(0.99 0.002 250);
--surface:     oklch(1 0 0);
--surface-sunk:oklch(0.975 0.003 250);
--border:      oklch(0.92 0.004 250);
--text:        oklch(0.22 0.01 250);
--text-muted:  oklch(0.55 0.012 250);
--accent:      oklch(0.58 0.17 250);   /* the one accent: interactive + verified */
--warn:        oklch(0.72 0.15 70);    /* unverified / could not trace */
--danger:      oklch(0.58 0.20 25);
```

Rules: neutrals carry ~90% of the surface. **One accent.** Semantic colour only for status, never
decoration. Never pure `#000`/`#fff`. Contrast AA everywhere — check muted and placeholder text.

## Typography

**Inter** (`next/font/google`) for everything, **Geist Mono** for numbers, code, column names and
timings. Two families, no more.

Scale — 6 sizes: `12 / 14 / 16 / 20 / 32 / 72`. `72` is the headline finding only.
Weights 400/500/600. Headings tracking `-0.02em`, line-height 1.1. Prose 16/1.55, `max-width: 68ch`.
**`tabular-nums` on every figure.** Right-align numerics in tables.

## Layout — progressive disclosure, not a dump

**Screen 1 — Ask (calm, near-empty).** One question box, centred, lots of air. Beneath it,
suggested-question **chips drawn from the benchmark questions** in `eval/`. A quiet line naming the
file on record (`superstore.csv · 9,994 rows`). Nothing else. This screen should feel like it is
waiting, not loading.

**Screen 2 — Working.** The four stages — *writing code → running in sandbox → verifying → done* —
as a **quiet, intentional sequence**. This is on screen during the demo: make it beautiful. One
stage active at a time, each with a live detail line and elapsed time so it is never silent. Stages
settle in place rather than popping. No spinner, ever. A failed attempt stays visible and the retry
is legible.

**Screen 3 — The finding.** Reveals in stages, not all at once:

1. The **headline number** (72px, tabular) and a one-line claim. Nothing else at first.
2. **One clean chart** that makes the number make sense.
3. Insight cards — at most 3 — each a single fact with its figure.
4. A one-line source, with the code and the source cells behind a disclosure. **The proof is one
   click away, never a wall of text on arrival.**

Keep the existing pipeline intact underneath: `Finding`, `Grounding`, `SchemaEvidence`, the code,
the cells. Change the presentation, not the contract.

## Charts

**Load the `dataviz` skill before writing a single line of chart code.** Recharts, minimal: no
gridline clutter, no legends where a direct label works, axis labels only where they earn their
place, tooltips that show the real value. Same palette tokens in light and dark. `tabular-nums` on
every axis and tooltip. A chart that needs a legend to be understood is the wrong chart.

## The two modes — build mode 1, architect for mode 2

- **Mode 1, text-first (build now):** the finding appears as text plus chart.
- **Mode 2, spotlight presentation (architect now, wire when ElevenLabs lands):** as Vera speaks,
  the relevant chart and figures come **forward** and the surrounding text clears — a business
  analyst walking you through it. Design that transition now: the result view must be able to
  promote one element and recede the rest, driven by a `spotlight: string | null` prop or
  equivalent. Do not hard-code the text layout in a way that blocks this.

## Cold open — the money shot

A scripted, deterministic view. No live dependency; it must not be able to fail on stage.

1. A naive AI confidently reports **2018 Q3 sales = $50,517** — and silently dropped 60% of the rows.
2. Vera reports **$143,787**, with the date-trap evidence shown: `OrderDate` is `DD/MM/YYYY`,
   proven by 5,952 values whose first component exceeds 12 and cannot be months, 0 arguing
   otherwise.

Under 30 seconds to the punchline. Both numbers are **real** — recorded, not invented. Label the
naive one as what it is.

## Motion

Fast 150ms / base 260ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Transform and opacity only. Staged
reveals, ~60ms apart. Elements settle; they do not bounce. **No number ever counts up** — animating
a real figure would undercut the entire product. `prefers-reduced-motion: reduce` kills all of it.
If it stutters, delete it.

## Accessibility

AA contrast on every pair actually shipped. Full keyboard path: question → submit → chips →
disclosure. Visible focus. Live region announces stage changes. Charts carry a text alternative —
the number and claim must be readable without seeing the chart. Wide content scrolls in its own
container; the page never scrolls sideways.

## Honesty — non-negotiable, outranks any visual goal

PRD §6 and `CLAUDE.md` bind every string on screen. A number renders **only** when
`verdict === "verified"`. The unverified state shows **no number at all**, and must look
deliberate, not broken. Never imply Vera can catch a subtly-wrong-but-runnable answer live; the
live claim is exactly *computed, and traceable*, and the accuracy figure is a separate
pre-computed benchmark. When the app is running mocked, say so on screen.

## Never

A second accent · a third font · a spinner · a card shadow stack · a number without its verdict ·
a chart without a real label · marketing copy that overstates verification.
