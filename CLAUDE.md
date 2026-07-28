# Vera — Agent Instructions

## PRD.md is the bible

**Read `PRD.md` at the repo root before doing anything.** It is the single source of truth for
scope, stack, build order, and the honest definition of "verified." If this file and PRD.md
disagree, PRD.md wins. If your idea is not in PRD.md, it is out of scope — ask first.

Vera is an AI business analyst that proves every number before she says it. She writes analysis
code, runs it in an isolated Daytona sandbox, grounds every figure in real source cells, and
refuses to state a number she can't show the work for.

## THE MONEY RULE (hard stop)

**Never run a real Fireworks, Daytona, Braintrust, or ElevenLabs API call without the builder's
explicit approval.** No exceptions, no "just one test call."

- Phase 0 (scaffold + mock) must be fully runnable with **zero external calls and zero API keys**.
- Before any phase that spends credits, say so and **wait for an explicit go**.
- Never write a real key into a file that git tracks. Secrets live in `.env.local` only.
- Every money-spending endpoint gets a rate limit before it ships.
- When in doubt: mock it, and ask.

## Honesty rule (this is the product)

Do not blur the two kinds of "verified" (PRD §6):

1. **Live grounding (per answer, real)** — the number was produced by code that actually executed
   on the real CSV cells. Show the code and the source cells.
2. **Measured accuracy (aggregate)** — the Braintrust benchmark score, pre-computed, shown as a
   dashboard.

We do **not** claim to catch a subtly wrong-but-runnable answer on an arbitrary CSV live.
Never let UI copy, a README, or a demo script imply otherwise. If a number can't be traced to
executed code, the UI must say **unverified** — never fall back to a guess.

## Stack (locked — PRD §5)

- Next.js App Router + TypeScript (strict, no `any`) + Tailwind + shadcn/ui. One repo, API routes
  are the backend.
- Runs **locally via `next dev`**. Do **not** deploy to Vercel — serverless timeouts kill the
  sandbox call.
- Fireworks (OpenAI-compatible SDK) · Daytona TS SDK (`@daytona/sdk`, one warm server-side
  singleton sandbox) · Braintrust + autoevals (offline) · ElevenLabs TS SDK.
- No DB (in-memory). No CopilotKit, no LangGraph.
- The **only** Python is the analysis code generated to run inside Daytona.

## Git workflow

- `main` is protected-by-convention. All work happens off **`dev`**.
- One short-lived branch per task: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`.
- Every branch merges into `dev` **via PR** so CodeRabbit reviews it. Never push straight to `dev`
  or `main`.
- Link the issue in the PR body (`Closes #N`) and state **how to verify** the change.
- Audit `git diff --staged` before every commit: no secrets, no `.env*`, no build artifacts.

## Skills

- Every coding task: use the **`superpowers`** skill.
- Anything touching UI: also use the **`frontend-design`** skill and the **shadcn MCP**.
- Anything with a chart, meter, stat tile or dashboard: load the **`dataviz`** skill first.

## Reference vaults (read before designing or delegating)

Two Obsidian vaults are the standing references for this repo. Read the relevant one
**before** you write UI code or fan out agents — not after.

**Design — `/Users/abhayp/Documents/Obsidian Vault/UI-UX/`**
Entry point `UI-UX Home.md`. Minimum read before touching any surface:
`Design Foundations.md` (spacing 4/8/12/16/24/32/48/64/96, type scale, AA contrast),
`AI Design Tells.md` (**the reject list — check every screen against it**),
`Typography.md`, `Color Systems.md`, `Checklists.md` (the anti-slop gate).
For the landing page also read `SaaS Landing Page Patterns.md` +
`Story-Driven Website Playbook.md`; for the in-app screens, `B2B SaaS Playbook.md`.
Where the vault and `DESIGN.md` disagree on a *tell* (uppercase mono micro-labels,
flat backgrounds, three identical cards, 11–13px type), **the vault wins** — DESIGN.md v4
has been reconciled to it.

**Orchestration — `/Users/abhayp/Documents/Obsidian Vault/Herdr/`**
Entry point `START HERE.md`. Before any fan-out: `System/Orchestration Protocol.md` →
`System/Agent Roster.md` → `Herdr/Herdr - Gotchas and Limits.md`. Use the `herd` CLI
wrapper in `bin/`, not raw `herdr` calls. Non-negotiables: results travel through
`tasks/<id>.result.md` files (never terminal scraping); budget-check before every spawn;
**two tasks must never write the same file** — same file ⇒ different phase.

## Definition of done

- `pnpm build` and `pnpm lint` pass. TypeScript strict, no `any`.
- Proven in the real artifact (browser, live route) — not just "the code looks right."
- Mock mode still works with zero keys after your change.
