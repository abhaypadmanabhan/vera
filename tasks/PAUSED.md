# PAUSED — four agents halted mid-flight

Paused 2026-07-24 at the builder's request (lost internet). Resume by telling the orchestrator
"resume the p9 agents".

## State

Base commit for all four branches: **`5a5f561`** on `feat/p2-fireworks`
(`feat(observability): trace live analyses into Braintrust Logs`).

**Nothing has been pushed. No `origin/p9/*` branch exists yet.** All work is uncommitted WIP
inside each worktree. Do not delete these worktrees — the work only lives there.

| Agent | Kind | Workspace | Worktree | Branch |
|---|---|---|---|---|
| `bt` | codex | `wG` | `~/.herdr/worktrees/Vera/p9-bt` | `p9/bt` |
| `guard` | codex | `wK` | `~/.herdr/worktrees/Vera/p9-guard` | `p9/guard` |
| `orb` | claude | `wH` | `~/.herdr/worktrees/Vera/p9-orb` | `p9/orb` |
| `mic` | claude | `wJ` | `~/.herdr/worktrees/Vera/p9-mic` | `p9/mic` |

Each worktree has its own `TASK.md` with the full brief and file ownership. Those are the
source of truth for what each agent was asked to do — re-read them before resuming.

## How far each got

**`bt` — Braintrust.** Modified `app/api/analyze/route.ts`, `instrumentation.ts`,
`lib/braintrust/logger.ts`, `lib/fireworks/client.ts`. Added
`tests/braintrust-logger.test.ts` and `tests/braintrust-fireworks-isolation.test.ts`.
Unverified — the whole point of the task is that traces must be *proven* landing via a REST
query, and that had not happened when it was halted.

**`guard` — guardrails.** New `lib/guardrails/classify.ts` and `lib/analyst/guarded.ts`;
modified `lib/analyst.ts`, `lib/types.ts`, `components/vera/finding-screen.tsx`. Three new
test files staged. Furthest along of the four.

**`orb` — ElevenLabs voice orb.** Modified `components.json`, `package.json`,
`pnpm-lock.yaml`, `app/globals.css`, `components/vera/deck-player.tsx`, `tests/deck-ui.test.ts`;
added `components/ui/`. A registry component was installed — confirm which one and that the
lockfile change is sane before merging.

**`mic` — speech input.** New `app/api/transcribe/`, `components/vera/mic-button.tsx`,
`components/vera/use-microphone.ts`, `lib/elevenlabs/`; modified
`components/vera/ask-screen.tsx`. Two new test files.

## On resume

1. Read each worktree's `TASK.md`, then `herdr agent read <name>` to see where it actually
   stopped — do not trust `idle`/`done`, an agent reporting idle can be blocked on a prompt.
2. Re-prompt each agent to continue, or take over the slice yourself if the agent's context is
   stale. Agents were halted with `esc`, so their session context is intact but the turn was
   cut mid-thought.
3. Nothing merges without `pnpm lint`, `npx tsc --noEmit`, `pnpm build`, `pnpm test` green
   **and** a browser check done by the orchestrator, not on an agent's say-so.
4. Tear down each worktree only after its branch is merged:
   `herdr worktree remove --workspace <id> --force`.

## Money

Live calls are approved for `bt` (as few as needed) and `mic` (max two). `guard` needs zero.

**A Daytona sandbox may still be alive from this session's live runs — it bills while it sits.**
Reap it:

```
set -a; . ./.env.local; set +a
VERA_LIVE=1 VERA_SANDBOX_ID=<id> pnpm vitest run tests/reap.live.test.ts
```

Never read, print, `cat`, `grep` or commit `.env.local`.

## Also open

- `tasks/definition-of-done.md` is the completion checklist: 31 proven, 10 in flight, 2 needing
  the builder (merging `dev` to `main`, and the standing sandbox-reap rule).
- `dev` holds merged PR #22. `main` is untouched and needs explicit approval.
