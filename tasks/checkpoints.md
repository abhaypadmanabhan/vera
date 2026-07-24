# Vera — Checkpoint Log

Append-only. One entry per phase boundary or major decision. **If the orchestrator's context is
cleared, this file plus `tasks/RESUME.md` is the entire handoff.** Never delete entries.

Repo: https://github.com/abhaypadmanabhan/vera (private) · base branch `dev` · one PR per phase.

---

## CP-0 — Setup · 2026-07-24 ~11:00 PDT · DONE

Git init, private GitHub repo, `main` + `dev` pushed. `CLAUDE.md` (PRD is bible + money rule +
honesty rule), `PRD.md` at root, `DESIGN.md` derived from the builder's UI/UX Obsidian vault,
`tasks/todo.md` phase plan, 20 GitHub issues labelled P0/P1/P2 + phase-N + money-free/spends-credits.

## CP-1 — Phase 1, mocked spine · 2026-07-24 ~11:47 PDT · DONE, PR OPEN

**PR #21 → `dev`: https://github.com/abhaypadmanabhan/vera/pull/21 — NOT MERGED. Awaiting builder review.**
Branch head: `feat/p1-scaffold-mock`. Phase 2 branches off THIS, not `dev`, until #21 merges.

Closed by the PR: #1 #2 #3 #4 #5 #6 #7.

Shipped: Next.js 16 + React 19 + TS strict + Tailwind v4 + shadcn (radix/nova, Geist, Lucide).
`lib/types.ts` (Finding is a discriminated union — the `unverified` branch has no `value` field),
`lib/analyst.ts` (the one-line mock→real swap point), `lib/stream.ts` SSE codec,
`hooks/use-analysis.ts`, `lib/csv.ts`, `lib/config.ts` (`MOCK_MODE` default true, `LIMITS`),
`lib/mock/engine.ts` (verified + retry→unverified paths), `POST /api/analyze` (SSE, node runtime,
zod, in-memory rate limit), full UI (dropzone, 4-stage timeline with visible retry, result card,
unverified card, "How do we know" popover carrying PRD §6 verbatim in spirit).

Verified by the orchestrator, not just reported: browser both paths, `curl -N` against the live
route with the real CSV, 400 validation, 18/18 vitest, build + lint + tsc clean, ran with
`.env.local` absent.

Agents used (all torn down at checkpoint): claude-account-2/Opus → UI, codex → API, cursor-agent → data.

## CP-2 — Data decisions · 2026-07-24 ~12:00 PDT · DECIDED, NOT YET BUILT

Builder supplied `Vera_data/` at the repo root (untracked): `vera_superstore.csv` (9,994 rows,
22 cols, 2.3 MB, 2016-2019), `vera_benchmark_superstore.json` / `.md` (17 Q&A).
**All 17 answers independently re-verified with pandas by the orchestrator — 17/17 match.**

Orchestrator finding that changed the plan: the notes call `OrderDate` "mixed-format free text".
It is not. All 9,994 rows are uniformly **DD/MM/YYYY**, which is worse — it mis-parses *silently*:

```
rows proving DD/MM (1st component > 12):  5,952
rows suggesting MM/DD:                        0
naive pd.to_datetime() → NaT (dropped):   5,952   (60% of the data, no error raised)
2018 Q3 sales:  naive $50,517.26   vs   correct $143,787.36   (2.8x wrong, runs clean)
```

### Decisions (builder, CP-2)

1. **Lean into the date trap.** Build a *deterministic* schema profiler that proves DD/MM from the
   data itself (5,952 rows whose first component exceeds 12 cannot be months; zero rows argue the
   other way), feed the inferred format into codegen, and **show that evidence in the grounding**.
   This is inference with shown evidence — NOT a claim to detect subtly-wrong-but-runnable answers,
   which PRD §6 explicitly disclaims. Do not blur the two.
2. **Add 2-3 date-derived benchmark questions** (e.g. 2018 Q3 sales = 143787.36) so the accuracy
   stat actually reflects the profiler. Keep the existing 17 `OrderYear`-based answers unchanged.
   Do NOT route questions around the profiler.
3. **Architecture change approved:** the server reads the 2.3 MB CSV from disk; the client receives
   schema + preview only. The current `data/demo.ts` inline-string approach does not scale to 2.3 MB.
4. **Superstore replaces the synthetic CSV** as the one demo dataset. The Phase 1 synthetic CSV is
   demoted to a test fixture so vitest does not parse 2.3 MB.
5. **Refusals / an `unanswerable` verdict: NOT NOW.** Protect the spine. Revisit in Phase 7 only.
6. **MONEY: Fireworks approved** for Phase 2. **Daytona is NOT yet approved** — Phase 3 needs a
   separate explicit go. Braintrust and ElevenLabs likewise.

### Standing process rules added by the builder at CP-2

- **Tear down every herdr agent at each phase boundary and spawn fresh ones.** Stale agent context
  causes drift. `herdr worktree remove --workspace <id> --force` after confirming each worktree is
  clean, pushed, and merged.
- **Update this file and `tasks/RESUME.md` at every checkpoint** so a context-cleared orchestrator
  can resume from disk alone.
- **The Phase 1 UI was rejected by the builder.** Phase 2+ includes a UI redesign driven by
  `/Users/abhayp/Documents/Obsidian Vault/UI-UX` (the builder's Obsidian vault). The UI agent must
  read the vault itself, not just the derived `DESIGN.md`.

## CP-3 — Phase 2 · IN PROGRESS · branch `feat/p2-fireworks`

**PR #21 (Phase 1) was MERGED into `dev`** at builder's approval. Phase 2 branch is
`feat/p2-fireworks`, cut from the Phase 1 head.

### Landed by the orchestrator (verified, merged, pushed)

- **`lib/profile/profiler.ts` — the deterministic schema profiler. This is the differentiator.**
  Proven on the real file: `OrderDate` → `%d/%m/%Y`, 5,952 supporting rows, 0 contradicting. It
  also caught `ShipDate` (6,096). It **refuses to guess** when a column reads validly both ways.
- **`lib/datasets.ts`** — server-side registry, reads the 2.3 MB CSV off disk, profiles once per
  process, exposes only `DatasetSummary` (schema + preview) to the client.
- **Wire contract changed:** the browser POSTs `{ question, datasetId, upload? }`. The CSV no
  longer crosses the wire. `AnalysisRequest` now carries a `ResolvedDataset`. Route, hook, mock
  engine and all tests migrated.
- **`isProven(evidence)` guard** — found by the eval agent: a fully-ambiguous column returns
  supportingRows 0 AND contradictingRows 0, so any consumer checking only `contradictingRows === 0`
  treated "unproven" as "proven". The mock engine had exactly that bug. Fixed + regression tests.
- **`DESIGN.md` v2** — v1 was rejected by the builder as a generic dark dashboard with weak
  hierarchy and the wrong layout. v2 commits to one idea: **Vera is an auditor marking up your data
  in red pen** — paper/ink/one red mark, Newsreader serif + Geist Mono and no sans at all, a
  single-column document of numbered exhibits with the reasoning trace as a left margin rail. New
  **Exhibit C** renders the schema evidence with its counts. Anti-goals list is explicit.

### Merged from agents

- **`p2/eval` (cursor, zero spend) — DONE, merged.** Benchmark rebuilt on Superstore: 21 questions,
  all recomputed and verified by the orchestrator. Three date-trap questions now carry the naive
  answer alongside the correct one:
  | Question | Correct | Naive month-first |
  |---|---|---|
  | 2018 Q3 sales | 143787.36 | 50517.26 |
  | July 2018 sales | 39261.96 | 16571.28 |
  | 2017 Q4 sales | 182297.01 | 34734.45 |
  Plus rows-vs-unique-orders (9,994 rows / 5,009 orders). Phase 1 synthetic CSV moved to
  `tests/fixtures/mini-business.csv`; `scripts/build-demo-data.mjs` deleted. `eval/README.md`
  documents why the baseline is fair: Vera's model only ever sees the profile + sample rows, never
  the 2.3 MB file, so the no-execution baseline gets identical context and simply cannot run code.
  Agent torn down after merge.

### Still running

- **`p2/fireworks` (codex) — SPENDING FIREWORKS CREDITS.** Issues #8/#9/#10: client + confirmed
  model id, codegen with structured output driven by the profile, retry loop against an injected
  fake executor. Explicitly forbidden from touching Daytona.
- **`p2/ui` (claude-account-2, Opus) — zero spend.** Full redesign against `DESIGN.md` v2, with the
  vault reading made mandatory in its brief.

### Known loose end

`data/demo.ts` survives as a thin stub because the old `app/page.tsx` still imports it. The UI agent
is removing that import; **delete `data/demo.ts` at the p2/ui merge.**

## CP-4 — Phase 3 · NOT STARTED · ⚠️ Daytona NOT approved yet

_(next entry appended here)_
