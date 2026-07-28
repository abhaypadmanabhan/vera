# Redesign v4 — landing · home · deck

Brief (builder, 2026-07-27): redesign the landing page (clean, minimal, easy to understand),
redesign the home/ask screen, and rebuild the deck components so everything fits in tandem —
good graphs, good typography, **no overlapping text**, real use of space.

References: `/Users/abhayp/Documents/Obsidian Vault/UI-UX/` (design law) and
`/Users/abhayp/Documents/Obsidian Vault/Herdr/` (delegation protocol). Both now pointed at
from `CLAUDE.md`. `dataviz` skill governs every chart. `PRD.md` §6 honesty rules are untouched.

## Decisions taken with the builder

- **Typefaces:** editorial serif display + Inter body + Geist Mono confined to code and cells.
  This overrides DESIGN.md v3's two-family rule; the vault's `AI Design Tells.md` calls mono-as-UI-font
  and uppercase mono micro-labels the two loudest tells, and Vera was using both as her default label idiom.
- **Deck charts:** plot the finding's own **context figures** against the headline, but only when they are
  commensurate (same unit, within two orders of magnitude). A total vs an average on one axis is the
  dual-axis anti-pattern; when nothing is commensurate the slide shows stat tiles and no chart.

## Evidence — what is actually broken (captured at 1440×900)

- **Deck `working` slide: text overlaps text.** `.deck-code` declares three grid rows and renders six
  children; the cells table and the schema-evidence paragraphs land on each other.
- **Deck `meaning` slide:** one context figure in a 2-row grid — roughly 60% of the stage is empty.
- **Deck focus recession never clears.** `activeBeat` resets to 0 on slide change, so after narration stops
  the slide still renders every non-focused region at `opacity: 0.24`. The summary slide reads as greyed-out.
- **No real chart anywhere in the deck.** `ProofChart` plots supporting vs contradicting rows — 5,952 vs 0.
  A bar and an empty track is not a chart (`dataviz` → "sometimes the answer is not a chart").
- **Footer is over-packed:** rail + status + wrapped suggestion chips + follow-up field in 9.25rem.
- **AI tells across all three surfaces:** uppercase mono micro-labels as the universal label idiom
  (`LIVE CLAIM`, `GROUNDED COMPARISON`, `YOU MIGHT ALSO ASK`), 16px marketing body against an 18px floor,
  flat background with no field or grain, every landing section the same eyebrow/heading/rows shape.

## Plan

### 0 — Foundation (owned here, must land before anything forks)
- [x] Serif display via `next/font/google`, wired in `app/layout.tsx`
- [x] Token layer in `globals.css`: display/body/mono roles, 18px body floor, spacing scale,
      background field + grain, retire `.v-label` as the default label idiom
- [x] Split deck styles out of `globals.css` into `app/deck.css` so the deck slice owns one file

### 1 — Landing (`app/page.tsx`, `components/landing/*`)
- [x] Hero carries an artifact, not a paragraph — the verified figure with its receipt
- [x] Proof strip directly under the hero
- [x] Vary section form down the page; kill the uniform eyebrow/heading/rows repeat
- [x] Body to 18px, nothing under 15px

### 2 — Home / ask (`components/vera/ask-screen.tsx`, `chrome.tsx`, `working-screen.tsx`)
- [x] Question box is the hero; the file on record gets presence instead of a footnote
- [x] Mock badge stops shouting
- [x] Working screen reads as a sequence, not a list

### 3 — Deck (`components/vera/deck-player.tsx`, `deck-chart.tsx`, `app/deck.css`)
- [x] One slide grid every kind fills — no collapsed rows, no overlap
- [x] `ContextChart` (Recharts, dataviz-compliant) on the meaning slide
- [x] Evidence as stat tiles + coverage meter, not a two-bar chart
- [x] Clear focus recession when narration stops
- [x] Footer gets room

### 4 — Verify (no claim without this)
- [x] `pnpm build` + `pnpm lint` + `pnpm test` clean
- [x] Playwright sweep at 1440 / 720 / 390 — every deck slide, zero overlap, zero horizontal scroll
- [x] Light and dark both checked
- [x] Mock mode still runs with `.env.local` absent

## Landed so far (deck slice + foundation)

Verified with Playwright at 1440 light, 1440 dark, 768 and 390 — every slide of a 7-slide deck,
**zero text overlaps, zero horizontal page scroll**. `pnpm test` 413 passed, `tsc --noEmit` clean,
`pnpm lint` clean.

- `app/globals.css` — v4 tokens: three font roles, 14/15/18/22/36/72 scale, `--v-surface` off pure
  white, `.v-label` re-cut as sentence-case Inter, `.v-field` background (grain + bloom).
- `app/layout.tsx` — Newsreader added; `.v-field` mounted once for every page.
- `app/deck.css` — rewritten around the single `head / body / note` grid.
- `components/vera/deck-chart.tsx` — new: `ContextChart`, `CoverageMeter`, `EvidenceStats`,
  and `contextSeries()`, which refuses to plot figures that cannot honestly share one axis.
- `components/vera/deck-player.tsx` — every slide kind rebuilt on the shared grid; focus recession
  now clears when narration stops; footer split into rail + controls.
- `lib/mock/engine.ts` — picks a named measure column instead of the first numeric one (the demo
  was summing `OrderYear`), and computes real per-category subtotals so the deck has a chart with
  commensurate data behind it.
- `components/vera/cold-open.tsx` + `comparison-chart.tsx` — coloured status dot replaced with a
  form-carrying mark, punchline set in the display face, comparison chart scaled to fill the stage
  (its axis labels were being sliced by the default 30px axis height).

Known non-issue: the overlap audit flags the closed `<details>` benchmark panel because Chrome still
reports client rects for its hidden content. The audit filters it; there is no visual overlap.


## Final verification (2026-07-27)

`pnpm build` ✓ · `pnpm lint` ✓ · `npx tsc --noEmit` ✓ · `pnpm test` 413 passed, 6 skipped.

Playwright sweep — landing, ask, working, all 7 deck slides, and the cold open's last beat, at
**1440 / 768 / 390 in both light and dark** (30 audited views): **zero text overlaps, zero
horizontal scroll, zero page errors.** Script: `scratchpad/sweep.mjs`.

Two audit traps worth remembering, both of which produced false positives before being filtered:
`.sr-only` nodes and closed `<details>` content still report client rects, and so does content
clipped by a scroll container — the audit now intersects each rect against its nearest clipping
ancestor.

Real defects the sweep caught after the first pass:
- `sr-only` applied directly to a `<table>` does not clip. A table ignores `width: 1px` and lays
  out at min-content, so each chart's text alternative was leaving a ~630px box past the right
  edge. Fixed in all three chart components by moving the clip to a wrapper `div`.
- **`cn()` was silently dropping every type-size token paired with a colour** (`text-small
  text-danger` → `text-danger`). `lib/utils.ts` now extends tailwind-merge with this system's
  token names. Repo-wide, invisible to the type checker and the test suite.
- The deck's caveat slide at 390px clipped through a line of type against the rail. The stage now
  fades at its bottom edge on narrow screens, the suggestion chips became one scrolling row
  instead of three wrapped ones, and deck type steps down below 640px.


## Round two (2026-07-27) — builder rejected the ask page and the landing

Feedback, verbatim: the ask page was *"lots of text thrown around, right side not clean and
minimalistic… hide those things under a click"*; the landing had *"no animations… where is the core
message… python code on landing page and non technical person has no idea why its there… no flow of
whats happening… no bg animations… doesn't look sleek or polished."*

All of it was accurate. What changed:

### Landing
- **The reveals were a load animation.** Every section played in the first second, so anything below
  the fold had finished animating before the reader arrived. Now viewport-driven
  (`components/landing/reveal.tsx`). Measured: 3 shown at the top, 17 mid-page, 23/23 at the bottom.
- **The hero was a pandas program.** Replaced with `proof-sequence.tsx` — the flow in plain English
  (reads your file → works out the answer → runs it, sealed off → checks it against the real cells),
  ticking down a rail, then the figure settles in. The figure never counts up. The code and cells
  moved behind *Show her working*, and that panel now explains in plain words WHY the date line
  decides the answer.
- **Background.** Two blooms on different periods (52s / 73s) at a visible opacity; the old single
  layer at 0.05 could not be seen at all.
- **Copy cut everywhere.** Hero sub is one sentence; the benchmark intro went 62 words → 32;
  "Writes the pandas" → "Writes the calculation".
- Hero was stacked, which pushed the demonstration below the fold — headline and CTA now sit side by
  side so the whole sequence lands above it at 1440.

### Ask
Panel is four lines at rest — label, filename, one shape line, and four collapsed disclosures
(`What she measured · 5`, `What she already proved · 2`, `The brief for the code · 5`,
`Columns · 22`). Nothing softened or dropped; the proven-rows evidence is still there in full,
one click away. None open on arrival. The lead paragraph under the heading is gone — that copy is
the landing page's job.

### Two real bugs found while verifying
- **An IntersectionObserver silently loses anything you jump past.** Element goes from below the
  viewport to above it in one step, ratio 0 before and after, callback never fires — 12 of 23 blocks
  stayed permanently invisible after a jump to the bottom. Fixed with a rAF-throttled scroll check
  alongside the observer.
- **JSX ate the space where an expression opened a line.** `{facts.questionCount} ordinary` rendered
  as `21ordinary`, `<span>{n}</span> that needed` as `11that`. Invisible in the source and in a
  screenshot; caught by reading `innerText` back. A glued-word regex now runs over every route.

### Verification
`pnpm build` ✓ · `pnpm lint` ✓ · `tsc --noEmit` ✓ · `pnpm test` 413 passed. Sweep over landing, ask,
working, all 7 deck slides and the cold open at 1440/768/390 in light and dark: **no overlap, no
horizontal scroll, no page errors.** Copy scan clean on all three routes. Reduced motion: every
reveal visible, sequence complete, figure shown.
