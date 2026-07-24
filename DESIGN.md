# DESIGN.md — Vera

All UI follows this file. Values here are the system; never hardcode a raw hex or a one-off size
in a component. Derived from the builder's UI-UX vault
(`~/Documents/Obsidian Vault/UI-UX` — read `Hackathon Speed Design`, `Color Systems`,
`What Makes Design Win`, `Motion and Micro-interactions` before touching UI).

## Feel (one line)

**A verification instrument, not a chat app.** Calm, dark, dense with evidence — Linear's restraint
with the seriousness of an audit tool. The screen should make you believe the number.

The first-30-seconds question: *what does this make people feel that words can't?* → **relief that
something finally shows its work.** Every decision serves that.

## Colors — dark-first (dark is the default and the demo mode; it photographs better on a projector)

Tokens live in `app/globals.css`. Cool midnight neutrals + **one** accent (mint) + semantic status.
Zero decorative color. Never pure `#000` / `#fff`.

```css
/* neutrals — 90% of the UI */
--bg:            oklch(0.16 0.012 258);   /* page */
--surface:       oklch(0.20 0.014 258);   /* card */
--surface-raised:oklch(0.24 0.014 258);   /* code block, table header */
--border:        oklch(0.30 0.015 258);
--text:          oklch(0.96 0.005 258);
--text-muted:    oklch(0.70 0.012 258);

/* the one accent — interactive AND the verified seal (mint IS the product's idea) */
--primary:       oklch(0.80 0.15 168);
--primary-fg:    oklch(0.18 0.03 168);

/* semantic — status only, never decorative */
--warning:       oklch(0.78 0.14 75);     /* unverified / blocked */
--danger:        oklch(0.65 0.19 25);     /* hard failure */
```

Rules: 2 active colors + neutrals, max. Accent covers ≤10% of the screen. Mint means **verified /
interactive**; amber means **we could not verify**; red means **it broke**. A number never renders
in mint unless `verdict === "verified"`.

Texture kit (hero only, cheap and high-return): one low-saturation radial gradient + a blurred
mint glow shape behind the hero, plus 3% SVG `feTurbulence` grain. Nothing else.

## Typography

- **Geist** (sans) for everything, **Geist Mono** for code, numbers and column names. Both already
  wired in `app/layout.tsx`. No third family.
- Scale: 12 / 14 / 16 / 20 / 32 / 56. The hero finding number is 56 (bump one step for projector).
- Weights: 400 / 500 / 600 only. Headings tracking `-0.02em`.
- **`tabular-nums` on every number that changes or aligns.** Right-align numerics in tables.
- Body max-width 65ch. Never center-align a paragraph.

## Shape & spacing

4px grid: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. `--radius: 0.625rem` (shadcn default, keep).
Two elevation levels only: flat card (1px border, surface bg) and raised (border + subtle shadow).

## Motion

150ms fast / 250ms base, ease-out. **Only `transform` and `opacity`.** Stage transitions in the
timeline animate from the direction that makes sense (next stage enters from below the previous).
Stagger-in on first load, ~40ms apart. **`prefers-reduced-motion: reduce` must kill all of it** —
opacity-only fallback. If it stutters, delete it.

## Components

- **Button** — all six states designed: rest / hover / focus-visible / active / disabled / loading.
  One primary action per screen (Analyze).
- **Card** — 1px border, surface bg, p-6, radius-lg.
- **Timeline stage** — pending (muted, no fill) / active (mint ring + pulse + live timer) /
  complete (mint check) / failed (amber). Always shows a detail line — the screen is never static.
- **Result card** — the hero. Big tabular-nums number, one-line plain-English claim, collapsible
  executed code (mono, `--surface-raised`), source-cell table. Both scroll in their own container;
  the page never scrolls horizontally.
- **Unverified card** — same footprint, amber accent, **no number anywhere**, states the reason and
  what was attempted. It is a designed state, not an error toast. It should look *deliberate* —
  refusing to answer is the feature.
- **Empty / loading** — skeletons matching final layout, never spinners. Empty state carries real
  copy + one CTA, never "No data".
- Icons: **Lucide only**, never mixed with another set.

## Accessibility (non-negotiable)

WCAG AA: 4.5:1 body, 3:1 large text and UI. Check muted and placeholder text specifically. Full
keyboard path through the demo: focus CSV → question → Analyze → expand code. Visible focus rings
on `--primary`. Labelled inputs. Live region announces stage changes.

## Never

Pure black/white · decorative color · a second icon set · spinners for content · a number without
a verdict next to it · marketing copy that overstates verification (see PRD §6 and CLAUDE.md) ·
3D, scrollytelling, theme switcher, settings page — all anti-scope for this build.
