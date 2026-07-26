# RESUME PROMPT — paste into a fresh Claude Code session

Everything below the line is the handoff. It assumes zero conversation history.
Last updated **CP-8 (phase 11 handover), 2026-07-26**.

---

You are the orchestrator for **Vera**, at `/Users/abhayp/Downloads/Projects/Vera`, branch
`feat/p2-fireworks`. You do the research, cut the worktrees, write the agent briefs, spawn the
agents, and you are the merge gate. You do not have to write every line yourself — but you DO
have to verify every line yourself.

**Read these first, in this order:**

1. `PRD.md` — the bible. Especially §6, the honest definition of "verified".
2. `CLAUDE.md` — the money rule and the honesty rule. Non-negotiable.
3. `tasks/checkpoints.md` — **start at CP-8**, the last entry.
4. `tasks/phase-11-scope.md` — **your phase. P0 comes before everything else.**
5. `tasks/definition-of-done.md` — §9 and §10 are the live ones.
6. `tasks/lessons.md` — three lessons, all earned the hard way.
7. `DESIGN.md` — the design system.

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
gates it → the deck presents it → ElevenLabs narrates it. Upload, prep, per-file chips and the
analyst-voiced deck are all merged and browser-verified. **344 tests pass**, lint/tsc/build clean.

`main` is untouched. Branch is `feat/p2-fireworks` at `0a8b5c6`. All worktrees are torn down.

## Do this first

**`tasks/phase-11-scope.md` P0. Nothing else starts until it is done.**

Prep — the whole any-file story — has **never run against real Fireworks or real Daytona**. The
2026-07-26 live session made zero `/api/prepare` calls.

The specific danger: `canonicalizePrepCode` rejects any prep program that does not match canonical
transforms token for token, and mock generates the canonical form *by construction*. So mock proves
nothing about this. If a real model quotes or structures its pandas even slightly differently, every
prep is rejected, prep fails open silently, and the upload story does nothing at all while appearing
to work.

Ask the builder for one supervised live run on a real non-Superstore file. Upload, watch prep, ask
two or three questions including one that needs a derived column such as `duration_amount`. Then
delete the Daytona sandbox **and confirm it is gone from the list** — the delete call returning is
not proof.

Expect P0 to define the real work of this phase. Do not plan P1 in detail before its results land.

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

Three lessons from the last runs, in `tasks/lessons.md`. The one that cost the most:
**dispatching an agent is not the end of a turn.** Two agents sat finished and unread because no
poller was set. Start background work and you own it until you have read its output.

Two more, both cost real time:
- A claude-kind agent's first prompt sometimes stalls as a staged paste. Send one bare
  `herdr agent send-keys <name> enter` — do not resend the text.
- Tell agents that `pnpm test` exiting non-zero on `ERR_PNPM_IGNORED_BUILDS` is not a failure —
  though this is now fixed in `pnpm-workspace.yaml`, so it should not recur.

## Open decisions belonging to the builder

- Merge `dev` → `main`.
- Delete the five stopped Daytona sandboxes (no compute cost, small storage cost, irreversible).
- Whether to deploy the static surfaces for a shareable link. `/ask` must not be public without
  auth — a stranger clicking a chip spends real credits.
