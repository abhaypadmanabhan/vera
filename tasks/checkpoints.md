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

- **`p2/fireworks` (codex) — DONE, merged.** Issues #8/#9/#10: `lib/fireworks/client.ts`,
  `lib/codegen/{generate,python-policy,retry}.ts`. It made **zero live calls** — worktrees have no
  `.env.local` (gitignored), and it correctly refused to go hunting in the main repo for keys.
  **Lesson for future phases: export the key into the pane env before starting an agent that needs
  live verification.** Agent torn down after merge.

### Live Fireworks verification, done by the orchestrator (builder had approved the spend)

- `GET /v1/models` → only **6** models exist on this account. `accounts/fireworks/models/glm-5p2`
  (ctx 1,048,576) **confirmed** — the pinned id is correct. Note the research doc's inferred
  `kimi-k2p7-code` and `minimax-m2p7` **do not exist**; it is `kimi-k2p6`. Pinning the
  doc-verified id was the right call.
- Total live calls: 3 (one model list, two codegen). Cost: negligible, cents.

### ⚠️ THE BIG FINDING — a poisoned convenience column

The first live codegen answered "Q3 2018 sales" using the `Order Quarter` column and produced
**131,098.53**. That is wrong, and it *ran perfectly cleanly*.

```
Q3 2018 sales, three ways:
  "Order Quarter" column   131,098.53   <- what the model reached for first
  proven OrderDate parse   143,787.36   <- correct, and what the answer key says
  naive month-first parse   50,517.26
```

`Order Quarter` disagrees with the quarter of `OrderDate` on **2,889 of 9,994 rows (29%)**.
`OrderYear` is clean (0 mismatches). This is exactly the runnable-but-wrong failure PRD §6 says we
cannot catch after the fact — so the profiler now catches it **before**, deterministically.

**`crossCheckPeriodColumns`** in `lib/profile/profiler.ts`: derive year/quarter/month from the
proven date parse, compare against any stated period column, count the disagreements, emit
`SchemaEvidence` plus a prompt note. Only same-subject columns are compared (`Order Quarter` is
checked against `OrderDate`, never against `ShipDate` — an order shipping next quarter is normal).
`DatasetProfile.crossChecks` carries the results.

**Verified live end to end:** with those notes in the prompt, Fireworks now writes
`pd.to_datetime(df['OrderDate'], format='%d/%m/%Y')` and derives the quarter from the date — its
own explanation says *"not the unreliable Order Quarter column"*. Executing that generated code
against the real file gives **143787.3622**, matching the answer key.

`tests/live-fw.test.ts` is gated behind `VERA_LIVE=1` so `pnpm test` can never spend money.

### Still running

- **`p2/ui` (claude-account-2, Opus) — zero spend.** Full redesign against `DESIGN.md` v2, with the
  vault reading made mandatory in its brief.

### Known loose end

`data/demo.ts` survives as a thin stub because the old `app/page.tsx` still imports it. The UI agent
is removing that import; **delete `data/demo.ts` at the p2/ui merge.**

## CP-4 — Phases 3 + 4 · DONE, VERIFIED LIVE · 2026-07-24 ~12:55 PDT

Builder approved Daytona for Phase 3 **and** the safeguard together, priority "working live demo
above all". Both landed on `feat/p2-fireworks`.

- **`lib/daytona/sandbox.ts`** — warm sandbox in a `globalThis` singleton (survives Next dev
  hot-reload), dataset uploaded once per sandbox lifetime, liveness probe with one recreate on a
  dead handle, explicit `teardownSandbox()`, `autoStopInterval: 30`. `MOCK_MODE` hard-blocks every
  entry point.
- **`lib/verify.ts`** — THE SAFEGUARD. Pure and exhaustively testable. Verified only if exit 0 AND
  a finite non-null value AND every column the model claims to have read exists in the real schema.
  It checks **provenance, not correctness** — deciding whether a clean number is the *right* answer
  is exactly what PRD §6 says we do not claim. Do not let anyone reword this.
- **`lib/real-analyst.ts`** — composes Fireworks + Daytona + the safeguard behind the same
  `Analyst` interface as the mock, so route/hook/UI are untouched. `lib/analyst.ts` lazily requires
  it so mock mode never loads a paid SDK.
- Retry loop widened to return `RetryOutcome` (execution + code + declared columns + attempts).

### The first live run FAILED, and that was the safeguard working

Fireworks printed `VERA_RESULT:{"total_sales_q3_2018": 143787.3622}` — a labelled object. The
parser only accepted a bare scalar, so it blocked, retried twice, and returned `unverified` rather
than shipping a number it could not parse. Correct behaviour, wrong contract. Fixed both ends:
the prompt now demands a bare value, and `parseResultValue` unwraps a **single-entry** object or
array (unambiguous) while still blocking multi-entry wrappers (genuinely ambiguous — which entry is
the answer?).

### Live proof, on the real 9,994-row file

```
[     0ms] writing_code     active    Warming the sandbox
[  2167ms] writing_code     active    Sandbox created in 0.3s · uploaded 2.4 MB
[  2801ms] writing_code     complete  Generated 6 lines of pandas
[  3761ms] running_sandbox  complete  Exit 0 in 828ms
[  5956ms] verifying        active    Tracing 143787.36 back to source cells
[  5985ms] verifying        complete  Grounded in OrderDate, Sales across 9,994 rows
[  5985ms] done             complete  Verified
```

`verdict: verified`, `value: 143787.36` (answer key: 143787.36). Real cells quoted. Schema evidence
attached. Sandbox torn down. Also confirmed in the browser with `VERA_MOCK=0` — the UI's
"MOCK ENGINE · NO SANDBOX CALL" masthead flag correctly disappears when live.

Live tests are gated behind `VERA_LIVE=1` (`tests/live-e2e.test.ts`, `tests/live-fw.test.ts`) so a
plain `pnpm test` can never spend money. 69 tests pass, 3 skipped.

**Sandbox hygiene: always run the teardown test after a live session, or a sandbox keeps burning.**

## CP-5 — Braintrust, UI v3, and the keynote pivot · 2026-07-24 ~13:55 PDT

**Money: Braintrust and ElevenLabs both APPROVED by the builder.** All four sponsor APIs are now
cleared. **The repo is PUBLIC** (audited first: `.env.local` never tracked, no secrets in history)
— done because CodeRabbit's free tier only reviews public repos, and it had been silently skipping
every PR ("auto reviews disabled on base branches other than the default branch"). `.coderabbit.yaml`
now enables `dev`.

### Braintrust — DONE, merged (#16)

**Vera 100% (21/21) vs baseline 47.6%.** 102 live Fireworks calls across two runs.
Dashboard URL is in `eval/results.json` (`dashboardUrl`).

The baseline, on **identical context**, missed: all three date-derived questions, total profit,
profit margin, West sales, Technology profit, the Tables loss, average discount, 2019 sales,
2018→2019 growth. It got rows-vs-unique-orders right.

**On stage, do not lead with the 100%** — it invites "of course, you executed code." Lead with what
the baseline missed and why. Vera's 100% means the model wrote code and the code ran on real cells;
it is not a claim that the model is clever.

### UI v3 — merged, then superseded within the hour

The Apple-clean rebuild landed (Ask → Working → Finding, charts, cold open at `/open`). The builder
then redirected again, to a **keynote** model. v3's screens remain the base; the Finding screen is
being replaced by the deck.

### THE KEYNOTE PIVOT — the current product shape

Builder's words: *"minimalesque, clean, white, smooth fading transitions from presentation
switches, dashboards like how Apple does its keynotes, with the finale being the summary
dashboard… once voice works it takes you around that information and the blob moves around like a
presenter moves around and shows a pointer to highlight specific parts."*

Orchestrator built the model so the agent only writes the player — **`lib/deck.ts`**:

- `buildDeck(question, finding, profile)` → question · headline · one slide per **proven** schema
  fact · code · cells · **summary dashboard finale**.
- Each slide carries `beats: { focus, spoken }[]`. `focus` matches a `data-focus="..."` attribute on
  the slide, so the presenter blob has real targets and **one `activeBeat` index drives both the
  blob and the audio** — when ElevenLabs drives it, no rewrite is needed.
- `matchSlide(question, deck)` routes a covered follow-up back to the slide that answered it, and
  returns **null** for a genuinely new question rather than faking a match.
- **An unverified finding produces ZERO slides.** Nothing to present, nothing to speak. The honesty
  rule expressed structurally — keep it that way.

**`/api/speak`** speaks one beat per call. **204 in mock mode**, so the mocked demo never calls out
and never fakes audio.

### Design history — three rejected directions, do not regress

1. v1 dark dashboard — rejected as generic.
2. v2 auditor / red-pen evidence document — rejected.
3. v3 Apple-clean — the base, but the builder still called the result "AI slop".

The builder asked specifically that a **GPT/Codex** agent do the taste pass using its **image
generation** and **`image-to-code`** skills (generate design images first, analyse, then build to
match), plus `high-end-visual-design` and `minimalist-ui`. `gpt-taste` is scoped to typography,
spacing and motion **quality only** — its AIDA/scroll-pinning structure is for landing pages and
would wreck a product surface. Claude agents were explicitly not given these skills.

## CP-6 — ORCHESTRATOR HANDOVER · 2026-07-24 ~14:40 PDT

The first orchestrator ran low on context and handed over here. **Everything below is current.**

### Working, verified live by the previous orchestrator

- **Full pipeline**: Fireworks writes pandas from the profile → Daytona warm sandbox executes →
  `lib/verify.ts` gates it. Live run: sandbox up 0.3s, exit 0 in 828ms, `verified`,
  **143787.36** (matches the answer key).
- **Voice is live.** `POST /api/speak` returned 200 three times in a real browser run with real
  ElevenLabs audio, ~450ms per beat after a 3.7s cold start.
- **Braintrust**: Vera **100% (21/21)** vs baseline **47.6%**. `eval/results.json` has
  `headline`, `dashboardUrl`, `baselineMisses`.
- **Landing page** at `/welcome` — hero, three-answers, how-it-works, proof, powered-by, CTA.
- **Deck** at `/` — 8 slides, warm white, presenter blob, progress rail, follow-up box.
- **Cold open** at `/open` — deterministic, both real figures.
- 83 tests pass, 5 skipped (live tests gated behind `VERA_LIVE=1`). Build and lint clean.

### Fixed in the last half hour (do not regress these)

1. **Chips did not run.** Clicking a suggestion set state, then submit read a stale value — the box
   cleared and nothing happened. Chips now call `ask(value)` directly.
2. **Theme followed the OS**, so the white design rendered dark. Light is now the default.
3. **Duplicate evidence examples** collided as React keys (8 dev-overlay issues, visible on stage).
4. **Hero showed 4 decimals** while the voice said 2. Display is 2dp everywhere now.
5. **Hero showed code jargon** — "Parsed OrderDate as DD/MM/YYYY, filtered…". Codegen now returns a
   separate plain-English `headline` field used for the hero claim; the technical line stays on the
   code slide. **The builder was explicit: no code jargon on the presentation.**
6. **The voice read the slides verbatim.** `lib/deck.ts` narration is now written separately in an
   analyst's voice — she gives the gist while the exact counts stay on screen. **Do not "simplify"
   this back to reading the slide text.**

### In flight when the handover happened

**Agent `polish` (codex, worktree `p7-polish`, branch `p7/polish`, workspace `wE`)** — strict
priority order, committing after each item:
1. **STOP/interrupt button** for the narration (highest value — there is currently no way to
   interrupt Vera on stage)
2. Fireworks + Daytona marks beside their stages on the working screen
3. Alignment/spacing pass across every slide
4. An ElevenLabs-style voice orb driven by `speaking`
5. The benchmark surfaced in the app, read from `eval/results.json`, never hardcoded

Merge whatever it pushes, verify in a browser yourself, and do not block on the later items.

### Builder's outstanding asks, not yet done

- Decide routing: landing is at `/welcome`; the builder was asked whether to swap it to `/` with the
  demo at `/ask` so the URL matches his narration order. **No answer yet — ask before moving it.**
- Powered-by strip currently uses typographic wordmarks, not vendor logos. Three of four official
  SVGs could not be fetched, and the agent refused to mix one real logo with three fakes. Builder
  was asked whether to retry; **no answer yet.**
- "Solidify Braintrust evals — numbers/reports visible showing it did its job and made the analyst
  better." Partly covered by polish item 5.
- Future, explicitly not now: interrupt/follow-up **by voice**.

### The two stump questions (answers computed and verified — use these on stage)

- *"Are our discounts actually making us money?"* → orders discounted **>20% average −$97.18**
  profit; **≤20% average +$49.04**. Money-losing orders carry an average **48.1%** discount vs
  **8.1%** on profitable ones.
- *"What percentage of orders shipped more than 5 days after they were ordered?"* → **18.25%**
  (average lag 3.96 days). Requires parsing **both** date columns correctly.

### Submission — due 3:30pm PDT

`docs/submission.md` has the Devpost writeup and the demo script, with the real Braintrust figures
filled in. Repo is already **public**. Remaining: record the demo video (<2 min), paste the writeup,
triage CodeRabbit on PRs #21 (merged) and #22 (open).

**PR #22 is open against `dev` and unmerged.** Branch `feat/p2-fireworks` holds everything.

_(next entry appended here)_

## CP-7 — PRODUCT PHASE · 2026-07-24 ~18:20 PDT · handover to a new orchestrator

The hackathon is over. This checkpoint closes the demo phase and opens the product phase.

### Landed since CP-6

Four agents (`p9/bt`, `p9/guard`, `p9/orb`, `p9/mic`), all merged into `feat/p2-fireworks`,
all verified in a real browser by the orchestrator, all worktrees torn down.

- **Guardrails** — `lib/guardrails/classify.ts`, a deterministic schema-aware classifier that
  runs BEFORE any spend. Refuses general knowledge, missing columns, opinion/prediction/causal
  questions, and requests to guess. Deliberately conservative: ambiguous wording passes, and
  the execution gate stays the final arbiter. Refusal renders as a choice, in plain English.
- **Braintrust Logs** — `lib/braintrust/logger.ts` + `instrumentation.ts`. One trace per live
  analysis: `analysis` (task) root with a nested `fireworks.chat` (llm) child carrying tokens,
  latency and cost. Fireworks is called over raw fetch, so auto-instrumentation has nothing to
  patch — the span is manual and deliberate.
- **Voice input** — `/api/transcribe` (ElevenLabs Scribe, server-side, rate limited, size and
  duration capped) plus a mic button. Transcript lands in the box; it is NEVER auto-submitted.
- **The orb** — the real ElevenLabs component. Registry was behind bot protection (429), so it
  was verified byte-identical by sha256 against the published `elevenlabs/ui` copy and installed
  from there. Retinted, glow stripped, three distinct states, no canvas under reduced motion.

### The honesty defect that mattered more than any of it

Tracing caught it live: the sandbox returned **143787.36** while the model's headline read
**"281,420 dollars"**. The hero and the voice both read the headline, so Vera would have
stated a number no code produced — the exact failure PRD §6 exists to prevent.

Cause: the model writes the code AND the plain-English sentence in one response, before the
code has run, and was authoring the figure into the sentence.

Fix: `lib/claim.ts`. The model emits a `{value}` slot; the executed value is substituted. If
the model ignores the instruction, the sentence survives only when every figure in it is either
the computed value or a number the user themselves wrote. Otherwise it is discarded for a
plainer true one. It always fails toward the executed value.

### Also fixed by the orchestrator

- `matchSlide` no longer lets one stray keyword hijack a new question. "total" and "run" are
  common English; a question now routes back only when it is deictic.
- `lib/follow-ups.ts` — Vera proposes the next question, derived from the columns the executed
  code read, every candidate filtered through the guardrail first. No model call.
- `pnpm-workspace.yaml` carried literal `set this to true or false` placeholders, so every
  lint/test/build exited non-zero. Three agents each burned time proving it was pre-existing.

### State

- **176 tests pass**, 5 skipped. Lint, `tsc --noEmit`, and build all clean, exit zero.
- Branch `feat/p2-fireworks`, pushed. PR #22 merged into `dev`. **`main` untouched.**
- `tasks/definition-of-done.md` — 48 proven, 2 open, both needing the builder.

### Braintrust dashboard — LIKELY A NON-ISSUE, CHECK THIS FIRST

The builder reports he cannot see traces. The traces exist and were verified through the REST
API (6 events, correct parent/child nesting). They are in:

- org **Padzy** · project **Vera Accuracy Benchmark**
- `https://www.braintrust.dev/app/Padzy/p/Vera%20Accuracy%20Benchmark/logs`

His screenshot showed **My Project** — a different, empty project created by the setup wizard.
Before diagnosing anything, open the URL above. If traces are visible there, the only real
decision is which project the app should log to, and `PROJECT_NAME` in
`lib/braintrust/logger.ts` plus `instrumentation.ts` must agree.

### What the builder asked for next — the product phase

1. **Vera must sound like an analyst, not a parser.** Narration and slides still surface
   "the dates were day-first", row counts and parsing detail. That was scaffolding to prove
   grounding; it is not analysis. She should lead with the finding and what it means — the
   number, the comparison, the "so what" — and keep provenance available but secondary.
2. **Upload any dataset.** Today the demo CSV is the centre of gravity. Vera should take an
   arbitrary file (a Netflix report was the example) and produce a data-backed presentation
   with real insights, not one figure per question.
3. **Insight decks, not single answers.** Multiple findings composed into a narrative.

These are product-shaped, not task-shaped. The next orchestrator should brainstorm and write a
plan before cutting any agents.
