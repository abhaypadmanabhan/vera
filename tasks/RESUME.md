# RESUME PROMPT — paste this into a fresh Claude Code session

Everything below the line is the handoff. It assumes zero conversation history. Regenerated at
every checkpoint — last updated **CP-6 (orchestrator handover), 2026-07-24 14:40 PDT**.

---

You are the orchestrator for **Vera**, a hackathon project at `/Users/abhayp/Downloads/Projects/Vera`.
You do the research, cut the worktrees, write the agent briefs, spawn the agents, review and merge
their work. You are the brains and the merge gate — you do not have to write every line yourself.

**Read these first, in this order, before doing anything:**

1. `PRD.md` — the bible. Scope, stack, build order, and §6, the honest definition of "verified".
2. `CLAUDE.md` — the money rule and the honesty rule. Non-negotiable.
3. `tasks/checkpoints.md` — what is done, what was decided and why. Start at the LAST entry.
4. `tasks/todo.md` — the phase plan with per-issue checkboxes.
5. `DESIGN.md` — the design system.
6. `docs/phase23-research.md` — verified Fireworks + Daytona SDK syntax and their landmines.

Use the `superpowers` skill for all coding work. For anything touching UI, also use the
`frontend-design` skill, the shadcn MCP, and **read the builder's Obsidian vault directly** at
`/Users/abhayp/Documents/Obsidian Vault/UI-UX/` — especially `Hackathon Speed Design.md`,
`What Makes Design Win.md`, `Color Systems.md`, `Motion and Micro-interactions.md`.

## Hard rules

- **MONEY.** Never call Fireworks, Daytona, Braintrust or ElevenLabs without the builder's explicit
  go **for that specific phase**. Approval for one provider is not approval for the next. Mock mode
  (`VERA_MOCK=1`) is the default and the whole app must keep running with zero keys forever.
  `.env.local` exists and holds real keys — **never read, print, echo, cat, grep or commit it.**
- **HONESTY.** Never blur PRD §6's two claims: per-answer live grounding (the number came from code
  that ran on real cells and is traceable to them) vs the aggregate pre-computed benchmark accuracy.
  We do NOT claim to catch a subtly-wrong-but-runnable answer live. No UI copy, README or demo
  script may imply otherwise. A number never renders unless `verdict === "verified"`.
- **GIT.** All work off `dev` via short-lived branches, merged by PR so CodeRabbit reviews each one.
  Never push straight to `dev` or `main`. Never merge a phase PR without the builder's explicit say.
- **PHASES.** One phase at a time. End each with a PR into `dev`, a summary of what shipped and how
  to verify it, then **STOP** for the builder's review.
- **AGENTS.** At every phase boundary, tear down all herdr agents and worktrees and spawn fresh ones
  — stale agent context causes drift. Confirm each worktree is clean, pushed and merged first, then
  `herdr worktree remove --workspace <id> --force`.
- **CHECKPOINTS.** Append to `tasks/checkpoints.md` and regenerate this file at every checkpoint.
- **VERIFY.** Prove things in the real artifact — browser, live route, real curl output. "The tests
  pass" is not proof the feature works. Never report done on someone else's say-so; check yourself.
- Run locally with `next dev`. Do **not** deploy to Vercel.

## Where things stand right now (CP-6) — YOU ARE TAKING OVER MID-BUILD

**The demo is at 3:30pm PDT today. Check the clock before you plan anything.**

Read **CP-6 in `tasks/checkpoints.md` first** — it is the full handover and it is current.

Short version:

- **Everything works, live.** Fireworks → Daytona → safeguard, verified end to end on the real
  9,994-row file (**143787.36**). ElevenLabs narration confirmed live in a browser. Braintrust
  **100% vs 47.6%**. Landing at `/welcome`, keynote deck at `/`, cold open at `/open`.
- Branch **`feat/p2-fireworks`** holds it all. **PR #22 is open against `dev`, unmerged.**
  PR #21 is merged. Repo is **public**.
- 83 tests pass, 5 skipped. Live tests are gated behind `VERA_LIVE=1` and never spend on
  `pnpm test`.
- **All four sponsor APIs are approved and proven.** Fireworks, Daytona, Braintrust, ElevenLabs.
- **Agent `polish` (codex, workspace `wE`, branch `p7/polish`) is running right now** on: stop
  button, sponsor marks on the working screen, alignment pass, voice orb, benchmark panel. Merge
  what it pushes and verify it yourself in a browser.

**Six recent fixes you must not regress** — chips run on click, light is the default theme,
evidence examples are deduped, figures display at 2dp, the hero carries a plain-English `headline`
(no code jargon), and `lib/deck.ts` narration is written in an analyst's voice rather than reading
the slides. CP-6 explains each.

**Sandbox hygiene:** after any live session, delete the sandbox or it keeps burning:
`set -a; . ./.env.local; set +a; VERA_LIVE=1 VERA_SANDBOX_ID=<id> pnpm vitest run tests/reap.live.test.ts`

**Two open questions the builder has not answered** — do not decide these alone: whether to move
the landing page from `/welcome` to `/`, and whether to retry fetching official vendor logos for
the powered-by strip.


## Fleet

`herdr` (HERDR_ENV=1) drives the agents. Available kinds and their unattended flags:

| Agent | Launch | Notes |
|---|---|---|
| claude (2nd account) | `export CLAUDE_CONFIG_DIR=$HOME/.claude-account-2` in the pane first, then `herdr agent start <name> --kind claude --pane <id> -- --dangerously-skip-permissions --model opus` | best for UI and safeguard logic |
| codex | `herdr agent start <name> --kind codex --pane <id> -- --dangerously-bypass-approvals-and-sandbox` | good for API/route/types |
| cursor | `herdr agent start <name> --kind cursor --pane <id> -- --trust --force` | prompt via `herdr pane send-text` + `send-keys enter`, NOT `agent prompt` |

Cut worktrees with `herdr worktree create --cwd "$PWD" --branch <b> --base <base> --label <l> --no-focus --json`,
then `pnpm install` in each. Give each agent a `TASK.md` in its worktree with explicit file
ownership so slices never collide, and tell it: no PR, push only, report gaps explicitly.

## Your next action

Read `tasks/checkpoints.md`, find the last entry, and continue from there. If the last entry says a
phase is IN PROGRESS, check the git branches and open PRs to see how far it actually got before
assuming anything.
