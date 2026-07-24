# RESUME PROMPT — paste this into a fresh Claude Code session

Everything below the line is the handoff. It assumes zero conversation history. Regenerated at
every checkpoint — last updated **CP-3, 2026-07-24 12:25 PDT**.

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

## Where things stand right now (CP-3)

- **Phase 1 is done and PR #21 is MERGED into `dev`.**
- **Phase 2 is in progress on branch `feat/p2-fireworks`.** Read CP-3 in `tasks/checkpoints.md`
  for the full state before touching anything.
- **MONEY: Fireworks is APPROVED. Daytona, Braintrust and ElevenLabs are NOT.** Phase 3 needs its
  own explicit go from the builder.
- The demo dataset is the real 9,994-row Superstore CSV at `data/superstore.csv`, served from the
  **server** — the client sends a `datasetId` and never receives the file. `eval/` holds 21
  questions, all recomputed and verified.
- The **deterministic schema profiler** (`lib/profile/profiler.ts`) is the differentiator. It
  proves `OrderDate` is `%d/%m/%Y` from the data (5,952 rows whose first component exceeds 12
  cannot be months; 0 argue otherwise) and carries that proof into the grounding as
  `SchemaEvidence`. Naive month-first parsing silently drops those rows and reports 2018 Q3 sales
  as $50,517.26 instead of $143,787.36. **Use `isProven(evidence)`** — checking
  `contradictingRows === 0` alone is a bug, because a fully-ambiguous column returns 0 and 0.
- The Phase 1 UI was **rejected**. `DESIGN.md` v2 is the replacement direction: an auditor's
  evidence document in paper/ink/red-pen, serif + mono with no sans, single column with a margin
  rail. Any UI agent must read the Obsidian vault itself, not just `DESIGN.md`.

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
