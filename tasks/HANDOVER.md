# Handover — 2026-07-27

Written by the outgoing session (v4 redesign) for whoever picks this up. Read `PRD.md` and
`CLAUDE.md` first; this file only covers what changed today and what is still open.

## State of the repo

- Branch `feat/p2-fireworks` is **pushed** and is the tip of all work. It is 165 commits ahead of
  `main`, 164 ahead of `dev`.
- **PR #35** (`feat/p2-fireworks` → `dev`) is **open and MERGEABLE, not merged.**
  <https://github.com/abhaypadmanabhan/vera/pull/35>
- `main` and `dev` are untouched.

### Two things blocked on the builder

1. **The merge could not be executed.** `gh pr merge 35` was denied by the harness permission
   classifier. The PR is clean and ready; it needs the builder to merge it, or to grant the
   permission. After that, `dev` → `main` still needs its own PR.
2. **CodeRabbit skipped the review** — 120 files, 20 over its 100-file limit on the current plan.
   This is not a defect in the PR; it is that `dev` was never kept current, so the PR carries the
   whole of phases 2–11 rather than just the redesign. Scoped reviews
   (`coderabbit review --dir <path>`) are the way to get coverage. Filed as an issue.

## What landed today

Six commits, `4d884b0..9a2d5a1`. All of it verified; see "How it was verified" below.

**Design system v4** (`app/globals.css`, `app/layout.tsx`, `DESIGN.md`)
Three faces, one job each — Newsreader for headlines and figures, Inter for everything else, Geist
Mono confined to code, cells, column names, filenames and timings. `.v-label` re-cut as
sentence-case Inter, which fixed every uppercase-mono micro-label in one edit. Scale re-valued to
14/15/18/22/36/72 with hard floors. `--v-surface` off pure white. `.v-field` background (grain +
two blooms on different periods) mounted once in the layout. Palette re-validated with the
`dataviz` skill's validator — all six checks PASS in light and dark.

**Landing** (`app/page.tsx`, `components/landing/**`)
The fold no longer carries a pandas program; it carries a demonstration of the flow in plain
English, with the code and cells behind *Show her working*. Scroll reveals are viewport-driven.
Eight sections, eight kinds of object.

**Home / ask** (`components/vera/ask-screen.tsx`, `home-dataset-panel.tsx`, `working-screen.tsx`,
`prep-screen.tsx`, `chrome.tsx`)
Quiet at rest: filename plus one line of shape, everything else behind four disclosures carrying
their counts, none open on arrival. Working screen is a ruled ledger with locked geometry.

**Deck** (`app/deck.css`, `components/vera/deck-player.tsx`, `deck-chart.tsx`)
One grid — head / body / note — filled by every slide kind. `ContextChart`, `CoverageMeter`,
`EvidenceStats`. `contextSeries()` refuses to plot figures that cannot honestly share one axis, and
keeps the subset that can.

**Mock engine** (`lib/mock/engine.ts`)
Was answering with the sum of `OrderYear` because it took the first numeric column. Now prefers a
named measure and computes real per-category subtotals.

## Six bugs fixed, none of which any existing check could catch

1. **`cn()` was silently deleting type sizes repo-wide.** `cn("text-small text-danger")` returned
   `"text-danger"` — tailwind-merge cannot tell a size from a colour without being told the tokens.
   Affected elements rendered at the browser default 16px. `tsc`, ESLint, `next build` and 413
   tests all passed with it in place. **`lib/utils.ts` must stay in sync with `@theme` in
   `globals.css` — a token added to one and not the other gets silently dropped again.**
2. **An IntersectionObserver silently loses anything you jump past.** 12 of 23 reveals stayed
   permanently invisible after a jump to the bottom. Fixed with a rAF-throttled scroll check.
3. **JSX ate the space where an expression opens a line** — `21ordinary`, `11that`. Use `{" "}`.
4. **The deck's structural overlap** — a three-row grid rendering six children.
5. **Focus recession never cleared** when narration stopped, leaving most of a slide at 30%.
6. **`sr-only` on a `<table>` does not clip** — a table ignores `width: 1px` and lays out at
   min-content, leaving a ~630px box past the viewport edge. The clip belongs on a wrapper `div`.

## How it was verified

- `pnpm build`, `pnpm lint`, `npx tsc --noEmit`, `pnpm test` (413 passed / 6 skipped).
- Playwright geometry sweep over landing, ask, working, all deck slides and the cold open at
  1440 / 768 / 390 in light and dark: no overlap, no horizontal scroll, no page errors.
  Script: the session scratchpad `sweep.mjs`; worth re-creating in `tests/` — see open issues.
- Rendered-copy scan for glued words on all three routes.
- Reduced motion: every reveal visible, sequence complete, figure shown.
- **Live, with the builder's explicit go** (`VERA_MOCK=0`): real Fireworks + Daytona + ElevenLabs
  returned `143,787.36`, matching the benchmark answer key `q18_sales_2018_q3`. 8 slides, exit 0,
  one `/api/speak` call. That run exposed two further defects — the chart's all-or-nothing scale
  guard, and a generated program too wide for its panel — both fixed and re-confirmed live.

**`.env.local` is back to `VERA_MOCK=1`.** Do not run the live path again without asking.

## Reference material

- `DESIGN.md` — v4, the binding spec.
- `tasks/redesign-v4.md` — the brief, the evidence for every defect, the verification.
- `tasks/lessons.md` — six new entries from today; read before touching layout or copy.
- `CLAUDE.md` — now points at both Obsidian vaults: `UI-UX` (design law, its `AI Design Tells.md`
  is a reject list) and `Herdr` (delegation protocol).

## What is genuinely still open

See the GitHub issues; the ones filed today are the accurate list. In short: `dev`/`main` are
behind, CodeRabbit has not reviewed this body of work, the geometry sweep lives in a scratchpad
rather than the repo, and the Devpost writeup and backup demo clip were never made.
