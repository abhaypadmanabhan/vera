# RESUME PROMPT — paste into a fresh Claude Code session

Everything below the line is the handoff. It assumes zero conversation history.
Last updated **CP-7 (product phase handover), 2026-07-24 ~18:20 PDT**.

---

You are the orchestrator for **Vera**, at `/Users/abhayp/Downloads/Projects/Vera`, branch
`feat/p2-fireworks`. You do the research, cut the worktrees, write the agent briefs, spawn the
agents, and you are the merge gate. You do not have to write every line yourself — but you DO
have to verify every line yourself.

**Read these first, in this order:**

1. `PRD.md` — the bible. Especially §6, the honest definition of "verified".
2. `CLAUDE.md` — the money rule and the honesty rule. Non-negotiable.
3. `tasks/checkpoints.md` — **start at CP-7**, the last entry.
4. `tasks/definition-of-done.md` — 48 proven, 2 open.
5. `DESIGN.md` — the design system.

Use the `superpowers` skill for coding work. For UI also use `frontend-design`, the shadcn MCP,
and read the builder's vault at `/Users/abhayp/Documents/Obsidian Vault/UI-UX/`.

## Hard rules

- **MONEY.** Never call Fireworks, Daytona, Braintrust or ElevenLabs without the builder's
  explicit go for that specific piece of work. Mock mode (`VERA_MOCK`) is the default and the
  whole app must keep running with zero keys forever. `.env.local` holds real keys — **never
  read, print, cat, grep or commit it.** Source it without echoing:
  `set -a; . ./.env.local; set +a`
- **After any live run, delete the Daytona sandbox.** It bills while it sits.
- **HONESTY (PRD §6).** Two claims, never blurred: per-answer live grounding ("computed, and
  traceable") versus the aggregate pre-computed benchmark (100% vs 47.6%). We do NOT claim to
  catch a subtly-wrong-but-runnable answer live. A number renders only when
  `verdict === "verified"`.
- **No code jargon on any presentation surface.** Column names, date formats and pandas terms
  belong on the code slide only. The builder has been explicit about this more than once.
- **GIT.** Short-lived branches merged by PR so CodeRabbit reviews them. Never push straight to
  `dev` or `main`. **Never merge to `main` without the builder's explicit approval.**
- **VERIFY.** Prove it in the real artifact — browser, live route, real output. An agent
  reporting success is not proof; check it yourself. `herdr agent get` reporting `idle` can be
  lying — always `herdr agent read <name>` before treating idle as done.
- **CLEAN UP.** `herdr worktree remove --workspace <id> --force` once a branch is merged.
- Run locally with `next dev`. Do not deploy to Vercel without asking (see the deploy note in
  `tasks/definition-of-done.md` §8 — the real blocker is money, not timeouts).

## Where things stand

Everything works end to end, live: Fireworks writes pandas → Daytona executes → `lib/verify.ts`
gates it → the deck presents it → ElevenLabs narrates it. Guardrails refuse what the file cannot
answer. Voice input works. Braintrust logs each run. **176 tests pass**, lint/tsc/build clean.

`main` is untouched. PR #22 is merged into `dev`. All agent worktrees are torn down.

## Do these first

1. **Braintrust visibility — probably not a bug.** The builder cannot see traces and considers
   it a loss because he cannot show judges. The traces exist; they were verified through the
   REST API. They are in org **Padzy**, project **Vera Accuracy Benchmark**:
   `https://www.braintrust.dev/app/Padzy/p/Vera%20Accuracy%20Benchmark/logs`
   His screenshot was of **My Project**, a different empty project the setup wizard made. Open
   the real URL first. If traces are there, the only decision left is which project the app
   should write to — `PROJECT_NAME` in `lib/braintrust/logger.ts` and `instrumentation.ts` must
   agree. Do not start a deep diagnosis before checking this.

2. **Make Vera sound like an analyst, not a parser.** This is the builder's main complaint.
   Narration and slides still lead with "the dates were day-first", row counts, and parsing
   detail. That was scaffolding built to prove grounding — it is not analysis. She should lead
   with the finding and what it means: the number, the comparison, the "so what". Provenance
   stays available, but secondary. `lib/deck.ts` owns the narration; note that its analyst voice
   was deliberately written and must not be "simplified" back into reading the slides aloud.

3. **Upload any dataset.** Today the demo CSV is the centre of gravity. Vera should take an
   arbitrary file — a Netflix report was the example — and produce a **data-backed presentation
   with real insights**, not one figure per question. That means multiple findings composed into
   a narrative. Note `resolveUpload` already exists in `lib/datasets.ts`; the profiler and the
   guardrail are already schema-driven, so the foundation is there.

These are product-shaped, not task-shaped. **Brainstorm and write a plan before cutting agents.**
Use the `superpowers:brainstorming` skill, get the builder's approval, then orchestrate.

## Fleet

`herdr` (`HERDR_ENV=1`) drives the agents.

| Agent | Launch |
|---|---|
| claude | `export CLAUDE_CONFIG_DIR=$HOME/.claude-account-2` in the pane first, then `herdr agent start <name> --kind claude --pane <id> -- --dangerously-skip-permissions --model opus` — best for UI |
| codex | `herdr agent start <name> --kind codex --pane <id> -- --dangerously-bypass-approvals-and-sandbox` — good for API/routes/types |

Cut worktrees with
`herdr worktree create --cwd "$PWD" --branch <b> --base feat/p2-fireworks --label <l> --no-focus --json`,
then `pnpm install` in each. Give each agent a `TASK.md` with **explicit file ownership** so
slices never collide, and tell it: no PR, push only, report gaps explicitly.

Two lessons from the last run, both cost real time:
- A claude-kind agent's first prompt sometimes stalls as a staged paste. Send one bare
  `herdr agent send-keys <name> enter` — do not resend the text.
- Tell agents that `pnpm test` exiting non-zero on `ERR_PNPM_IGNORED_BUILDS` is not a failure —
  though this is now fixed in `pnpm-workspace.yaml`, so it should not recur.

## Open decisions belonging to the builder

- Merge `dev` → `main`.
- Delete the five stopped Daytona sandboxes (no compute cost, small storage cost, irreversible).
- Whether to deploy the static surfaces for a shareable link. `/ask` must not be public without
  auth — a stranger clicking a chip spends real credits.
