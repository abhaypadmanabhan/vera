# Vera — Phase Plan

Source of truth: `PRD.md` §4 (build order). Rules: `CLAUDE.md`.
Repo: https://github.com/abhaypadmanabhan/vera (private) · base branch `dev` · every task lands via PR.

**Clock:** Jul 24 2026 · build until ~3:30pm PDT (submission). Phases 1–4 are the win; 5–7 are stretch.

---

## Phase 1 — Scaffold + Mock Spine · P0 · 💚 ZERO external calls, zero keys

The whole demo, end to end, with nothing real behind it. Exit gate: `rm -f .env.local && VERA_MOCK=1 pnpm dev`
runs a full demo. Parallelisable across 3 agents (UI / API+types / data).

- [x] #1 P1.1 — Next.js scaffold: TS strict, Tailwind, shadcn/ui, mock-mode env
- [x] #2 P1.2 — Domain types + the single swappable mock module
- [x] #3 P1.3 — Demo business CSV (24 months, realistic, some messy rows)
- [x] #4 P1.4 — UI: CSV dropzone + question box
- [x] #5 P1.5 — UI: live 4-stage reasoning timeline
- [x] #6 P1.6 — UI: result card — number + code + source cells + unverified state
- [x] #7 P1.7 — /api/analyze streaming route wired to the mock engine

## Phase 2 — Fireworks brain · P0 · 💸 SPENDS CREDITS (needs explicit go)

- [x] #8 P2.1 — Fireworks client + model selection (from recommended-models, not a guess)
- [x] #9 P2.2 — Codegen: CSV schema + question → pandas (structured output)
- [x] #10 P2.3 — Retry loop: stderr fed back, max 2 attempts

## Phase 3 — Daytona sandbox · P0 · 💸 SPENDS CREDITS

- [x] #11 P3.1 — Warm sandbox singleton, pandas preinstalled
- [x] #12 P3.2 — Write CSV into sandbox + execute generated code → result

## Phase 4 — The safeguard · P0 · 💸 SPENDS CREDITS (live path)

- [x] #13 P4.1 — Grounding check, block-and-retry, honest unverified state
- [x] #14 P4.2 — Rate limits + secret hygiene on money endpoints (💚 free)

## Phase 5 — Braintrust proof · P1 · 💸 (P5.2 only)

- [ ] #15 P5.1 — 15-question benchmark + answer key + no-execution baseline (💚 free)
- [ ] #16 P5.2 — Braintrust eval run + headline stat + dashboard link

## Phase 6 — Voice + cold open · P1 · 💸 (P6.1 only)

- [ ] #17 P6.1 — ElevenLabs speaks the verified finding
- [ ] #18 P6.2 — Cold open: wrong-AI vs Vera, first 30 seconds (💚 free)

## Phase 7 — Polish + submit · P2 · 💚 free

- [ ] #19 P7.1 — Polish pass + recorded backup demo clip
- [ ] #20 P7.2 — Devpost writeup + sponsor list + CodeRabbit pass

---

## Gates

1. Money: no Fireworks / Daytona / Braintrust / ElevenLabs call without the builder's explicit go.
2. Each phase ends with a PR into `dev` + a "how to verify" summary, then **STOP** for review.
3. Phase 1 must stay runnable with zero keys forever — later phases add a real path, they do not
   replace the mock path.
