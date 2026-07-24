# DESIGN.md — Vera

**v2.** v1 was rejected: too generic, weak hierarchy, wrong layout — a dark dashboard like every
other AI tool. This document replaces it. Derived from the builder's vault at
`/Users/abhayp/Documents/Obsidian Vault/UI-UX/`. **Read the vault yourself before building** —
especially `What Makes Design Win`, `Awwwards Teardowns 2026`, `Typography`, `Color Systems`,
`Motion and Micro-interactions`. This file is the summary; the vault carries the reasoning.

---

## The one committed idea

> **Vera is not a dashboard. She is an auditor marking up your data in red pen.**

The screen is a **document of evidence**, not a control panel: paper, ink, and one red mark. Every
other AI tool at this event will be dark glass panels with a mint accent. We are the only one that
looks like a finding you could hand to a CFO.

The vault's teardown data says the common denominator of winners is *one idea pushed hard, a
two-colour palette, and typographic craft* — not 3D, not effects. This is that idea.

**The 30-second feeling:** relief that something finally shows its work.

## Anti-goals — reject on sight

Dark glassmorphism · gradient mesh backgrounds · neon mint/cyan on charcoal · three stacked cards
in a 2-column grid · glowing borders · "AI sparkle" iconography · centred hero with a subtitle and
two buttons · any layout that would look identical with a different product's copy in it.
If a screenshot of this could be any AI SaaS, it has failed.

## Colour — exactly two, plus one mark

Commit to **light**. No dark mode, no theme toggle (vault: anti-scope). Near-black on warm paper
projects fine — Depo Luxe won SOTD 7.62 on pure black and white.

```css
--paper:      oklch(0.975 0.008 85);   /* warm off-white — the page */
--paper-deep: oklch(0.945 0.010 85);   /* recessed: exhibits, code blocks */
--ink:        oklch(0.20 0.012 250);   /* near-black, faintly cool — all text */
--ink-muted:  oklch(0.52 0.012 250);   /* secondary text, labels */
--rule:       oklch(0.86 0.008 85);    /* hairlines. 1px. everywhere. */

--mark:       oklch(0.56 0.20 28);     /* THE red pen. */
--mark-wash:  oklch(0.94 0.04 28);     /* the faintest wash behind a marked region */
```

**The red pen is the whole colour system.** It marks: the verdict stamp, the columns Vera actually
read, the interactive affordance, and the refusal. Nothing else is ever coloured. No green check —
green-for-success is the cliché we are avoiding. A verified number is simply set large in ink; the
red mark is the *annotation around it*, exactly like an auditor's pen.

Refusal ("Vera has no number for this one") is set in ink with a red rule and a struck-through
placeholder where the number would be. **The absence must be composed, not apologetic.**

## Typography — this is the brand

Two families. Nothing else, ever.

- **Newsreader** (`next/font/google`, variable) — the editorial voice. Claims, headings, prose.
  Weights 400/500/600. Headings tracking `-0.02em`, line-height 1.1.
- **Geist Mono** (already installed) — **every number, column name, cell value, code line, label
  and timestamp**. `font-variant-numeric: tabular-nums` on all of it. Small labels are mono,
  uppercase, `0.08em` tracking, 11-12px, `--ink-muted`.

The serif/mono pairing with **no sans at all** is the signature. It reads as printed evidence and
it is instantly not-AI-slop.

Scale — 5 sizes, no more: `12 / 14 / 17 / 28 / 88`.
`88` is the finding number only, mono, tabular. Prose sits at 17 with `max-width: 68ch` and
line-height 1.55. Bump one step for the projector.

## Layout — a document with a margin rail, not a grid of cards

```
┌──────────────────────────────────────────────────────────────────┐
│  VERA                                          [ how do we know ]│  ← hairline rule under
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│  MARGIN  │   THE DOCUMENT                                        │
│  RAIL    │                                                       │
│          │   Question, set in serif, large.                      │
│  audit   │                                                       │
│  trail   │   ─────────────────────────────────────────           │
│  runs    │                                                       │
│  down    │   −17,725.48        ← 88px mono, tabular              │
│  the     │   Tables lost more than any other sub-category.       │
│  left,   │                          ← serif claim, 28px          │
│  mono,   │                                                       │
│  stamped │   EXHIBIT A — THE CODE THAT RAN                       │
│  times   │   ┌────────────────────────────────────────┐          │
│          │   │ mono, paper-deep, hairline, red mark   │          │
│  ● 0.9s  │   │ on the line that uses the proven fmt   │          │
│  ● 1.3s  │   └────────────────────────────────────────┘          │
│  ● 0.8s  │                                                       │
│          │   EXHIBIT B — THE CELLS SHE READ                      │
│          │   real rows, mono, marked columns in red              │
│          │                                                       │
│          │   EXHIBIT C — WHAT SHE PROVED ABOUT YOUR DATA         │
│          │   5,952 rows can only be day-first. 0 argue otherwise.│
└──────────┴───────────────────────────────────────────────────────┘
```

- **Single column document**, generous margins, one narrow left **margin rail** carrying the live
  reasoning trace as marginalia with mono timestamps. The rail is the timeline — it replaces the
  old "card of four steps". It should feel like a court reporter's log running alongside.
- **Exhibits, labelled A/B/C** in mono smallcaps. Numbered exhibits are the whole conceit: this is
  evidence, presented in order.
- **Exhibit C is new and it is the money shot** — the schema facts Vera *proved from the data*,
  with the counts. "5,952 values have a first component above 12, which cannot be a month. 0 argue
  the other way." Give it real weight; nobody else at this event has this.
- Nothing is centred except the top rule. No card shadows anywhere — **hairlines only**.

## Motion — paper, not glass

150ms fast / 260ms base, `cubic-bezier(0.22, 1, 0.36, 1)`. Transform and opacity only.

- Rules **draw** left-to-right (`scaleX`) as a section arrives.
- Exhibits arrive by **clip-path reveal** from the top edge, like a page being uncovered.
- The verdict mark **stamps**: fast scale-down from 1.06 with a tiny rotation (−2deg), once.
- The margin rail advances a dot and prints a timestamp per stage. Never silent — always a line of
  live detail (vault: silence kills the demo).
- **No number ever counts up.** Fake animation of a real figure would undercut the entire product.
- `prefers-reduced-motion: reduce` kills all of it — opacity only.

## Components

- **Button** — text + a red underline that thickens on hover; not a filled pill. All six states.
  One primary action on screen.
- **Input** — a ruled line, not a box. Serif text sitting on a hairline, red rule on focus.
- **Exhibit** — hairline border, `--paper-deep` fill, mono label above in smallcaps.
- **Marked cells** — the columns the code actually read get `--mark-wash` behind them and a red
  underline. The reader should see *which cells* at a glance.
- **Verdict stamp** — mono, uppercase, letterspaced, red hairline box, slight rotation. `VERIFIED`
  or `NO NUMBER RELEASED`.
- Icons: **almost none**. Lucide only if genuinely needed, hairline weight. Prefer typographic
  marks (`—`, `·`, `↳`) over icons. An icon set is a crutch this design does not need.

## Accessibility — non-negotiable

WCAG AA: 4.5:1 body, 3:1 UI. Check `--ink-muted` on `--paper` and the red on paper specifically.
Never encode meaning in colour alone — the verdict always carries its word. Full keyboard path
through the demo, visible focus (a red rule, not a glow). Live region announces stage changes.
Wide exhibits scroll inside their own container; the page never scrolls sideways.

## Departures recorded during the build (v2.1)

Each of these moves *toward* the concept, not away from it. Measured in Chromium at 1440×900
and 1280×800.

1. **`--ink-muted` darkened `0.52 → 0.45`, and a second step added on the red ramp.**
   At `0.52` muted body text measured 4.3:1 on paper — under AA. It now measures **6.89:1**.
   `--mark` at `0.56` measures 4.77:1, fine for the stamp, rules and marks (UI, 3:1) but thin for
   12px red text, so small red type uses **`--mark-ink: oklch(0.47 0.19 28)` (7.0:1)**. Same hue,
   same pen — a ramp step, not a second accent.
2. **The refusal placeholder is a struck *slot*, not struck glyphs.** `——,———.——` set at 88px mono
   renders as disconnected dashes and reads as a rendering bug. It is now the figure's blank space,
   ruled, with a red stroke corner to corner — the mark an auditor puts through space that must
   stay empty — captioned "the figure's place, left blank".
3. **Mock mode is stated on screen.** While the mock engine drives the run, the masthead carries
   `MOCK ENGINE · NO SANDBOX CALL` and the colophon says which parts are scripted and which
   (Exhibit C) are counted from the real file. The honesty rule outranks a clean masthead.
4. **Exhibit B leads with the full column list, marked.** Quoting only the read columns made every
   cell red and killed the contrast the red pen exists to create. The file's whole column list sits
   above the quoted rows with the read ones washed — the "which cells" read happens at a glance.
5. **Wide exhibits are keyboard-scrollable regions** (`tabindex="0"`, labelled), so the sideways
   scroll the design relies on is reachable without a mouse.

## Never

A second accent colour · a sans-serif · a card shadow · a green check · a dark mode · a filled
button · a centred paragraph · a number without its verdict · copy that overstates verification
(PRD §6 and CLAUDE.md are binding on every string on screen).
