# DESIGN.md — Vera

**v4.** v3 was written from the builder's direct spec; v4 keeps its brief and reconciles it with
the builder's vault at `/Users/abhayp/Documents/Obsidian Vault/UI-UX/`, which flagged three things
v3 shipped as defaults: uppercase mono micro-labels (and mono as a general UI font), marketing body
type under an 18px floor, and a flat background with no field. **Where v4 and the vault's
`AI Design Tells.md` conflict with anything older, v4 wins.** Read the vault before building, and
use the **Mobbin MCP** (`search_screens`, `search_flows`, `search_sections`) for real reference
screens.

**What changed in v4** — the rest of this document still holds:

- **Three families, one job each** (see Typography below), not two.
- **`.v-label` is sentence-case Inter**, not uppercase mono. Mono is confined to code, cell values,
  column names, filenames and timings.
- **Type floors:** no sans below 15px, no mono below 13.5px, prose at 18px.
- **`--v-surface` is no longer pure white**, and every page carries a `.v-field` background
  (paper grain + one slow accent bloom) mounted once in `app/layout.tsx`.
- **The deck has one grid** — `head / body / note` — that every slide kind fills; see "The deck".
- **The deck follows the app theme.** It no longer forces its own light palette.

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
--surface:     oklch(0.995 0.002 250);  /* never pure white — see "Surface" below */
--surface-sunk:oklch(0.975 0.003 250);
--border:      oklch(0.92 0.004 250);
--text:        oklch(0.22 0.01 250);
--text-muted:  oklch(0.55 0.012 250);
--accent:      oklch(0.58 0.17 250);   /* the one accent: interactive + verified */
--warn:        oklch(0.72 0.15 70);    /* unverified / could not trace */
--danger:      oklch(0.58 0.20 25);
```

Rules: neutrals carry ~90% of the surface. **One accent.** Semantic colour only for status, never
decoration. Never pure `#000`/`#fff` — `--v-surface` is `oklch(0.995 0.002 250)`, not `oklch(1 0 0)`.
Contrast AA everywhere — check muted and placeholder text.

**Status is carried by form, colour only marks urgency.** A filled tick against a hollow ring, not
a green dot against a red dot — so every state still reads in greyscale. The single reserved
urgency colour is `--v-warn`, for the one state that needs a human: unverified, or a mocked run.

**The page has a background.** `.v-field` — paper grain at ~3.5% plus one very slow accent bloom —
is mounted once in `app/layout.tsx` and sits behind every surface. Flat white is the strongest AI
tell after coloured status dots. Do not add a second, page-local backdrop.

## Typography

Three families, one job each — all via `next/font/google`:

- **Newsreader** (`--font-display`) is the voice: headlines, slide titles, and the headline figure.
  An analyst who cites her sources should read like a paper, not like a dashboard. `h1/h2/h3`
  default to it in the base layer, so no component asks for it by hand.
- **Inter** (`--font-sans`) carries every other word — body, labels, buttons, captions, chips.
- **Geist Mono** (`--font-mono`) is confined to **code, cell values, column names, filenames,
  timings and exit codes**. Mono anywhere else is the loudest AI tell in the vault, and v3 used it
  as the default label idiom.

Scale — 6 sizes: `14 / 15 / 18 / 22 / 36 / 72`. Floors are hard: **no sans below 15px, no mono
below 13.5px, prose at 18px.** `72` is the headline finding only; deck figures use their own
`clamp()` above that. Weights 400/500/600. Headings tracking `-0.02em`, line-height ~1.05.
Prose 18/1.6, `max-width: 68ch`. **`tabular-nums` on every figure.** Right-align numerics in tables.

**The label idiom is `.v-label`** — sentence-case Inter, 15px, weight 500, no tracking, no
uppercase, no mono. `.v-marker` is the numbered chapter marker, in the body family, and is only
legitimate where the content genuinely is an ordered sequence. `.v-mono` is the technical string.

**Adding a token means editing two files.** `lib/utils.ts` extends tailwind-merge with this
system's token names; without that, `cn("text-small text-danger")` returns `"text-danger"` — it
cannot tell a size from a colour and silently drops one. Any token added to `@theme inline` in
`globals.css` must be added to `SIZES`/`COLORS` there in the same change.

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

Three rules Vera's data adds on top:

1. **Sometimes the answer is not a chart.** Supporting rows against contradicting rows is almost
   always `N` against `0`, and a bar of zero draws nothing — so the most important number in the
   pair is the one that vanishes. That pair is two stat tiles. Coverage (rows read of rows in the
   file) is one meter. Neither is a chart.
2. **One axis, or no chart.** `components/vera/deck-chart.tsx` plots the headline figure beside its
   context figures **only** when they are commensurate: numeric, same sign, and within two orders of
   magnitude. A total against a per-record average is the dual-axis anti-pattern wearing a single
   axis. When nothing is commensurate the slide states the figures instead — that is the right
   answer, not a degraded one.
3. **Emphasis is not a second series.** The answer's bar wears the accent; everything it is measured
   against stays in the hairline neutral. Every bar is direct-labelled and an `sr-only` table
   carries the same numbers, so no value is ever colour-only or hover-only.

Re-run `scripts/validate_palette.js` from the `dataviz` skill before changing any chart colour or
either surface. Current state: light `#0073cf`/`#cc272e` on `#fdfdfe` and dark `#3093ec`/`#e24947`
on `#121416` — all six checks PASS.

## The deck

**One grid, filled by every slide kind** (`app/deck.css`):

```
.deck-canvas   grid-template-rows: auto  minmax(0, 1fr)  auto
                                   head       body        note
```

v3 gave each kind its own bespoke grid and its own row count; the `working` slide declared three
rows and rendered six children, so the cells table and the evidence prose landed on top of each
other. The rules that keep that from coming back:

- Slide content is always `header.deck-head` → `div.deck-body` → `p.deck-note`. Nothing else.
- The body row takes all remaining height. Any region that can overflow scrolls **inside itself**
  and carries `min-height: 0`.
- Below 900px the canvas rows go content-sized, `min-height` is released, and the slide scrolls. A
  narrow stage is a page, not a fixed canvas.
- Below 640px the chart gives way to stat tiles — a 390px plot cannot hold both a category label
  and a value label, and a clipped figure is worse than no chart.
- **Narrated slides carry no jargon.** No filename, no exit code, no timing, no column name — those
  live on the `working` slide. `tests/deck-ui.test.ts` holds this line for the whole deck.
- **Focus recession follows the voice and clears when it stops.** A stopped deck showing most of
  its slide at 30% opacity is a bug, not a style.

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

A second accent · a fourth family · a spinner · a card shadow stack · a number without its verdict ·
a chart without a real label · marketing copy that overstates verification.

And, from the vault's reject list — check every screen against these before showing anyone:
uppercase mono micro-labels · mono used as a UI font · three identical rounded cards in a row ·
a lucide icon in a rounded square beside every heading · coloured status dots · sans type under
15px · uniform section padding down the whole page · a flat background · a numbered marker on
content that is not a sequence.
