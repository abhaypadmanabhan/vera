# Vera

**Vera is an AI business analyst that proves every number before she says it.** You point her at
your business data, she writes analysis code, runs it in an isolated Daytona sandbox, grounds every
figure in the real source cells, and presents the finding out loud. She will not state a number she
can't show the work for.

## What "verified" honestly means (PRD §6)

Two different claims — we never blur them:

1. **Live grounding (per answer, real).** The number was produced by code that actually executed on
   the real CSV cells. We show the code, the exit status, and the source cells it read. If code
   fails or the value can't be traced back to real cells, the UI says **unverified** and shows no
   number. There is no guess fallback.
2. **Measured accuracy (aggregate, offline).** A pre-computed score on our fixed ~15-question
   benchmark (`eval/`), Vera vs a no-execution baseline. It is a dashboard number, not a per-answer
   guarantee.

We do **not** claim to catch a subtly wrong-but-runnable answer on an arbitrary CSV live — at demo
time there is no answer key.

## Run it in 60 seconds

```bash
pnpm install
pnpm dev
```

No API keys. No `.env.local`. Mock mode is the default (`VERA_MOCK` defaults to `1`; only
`VERA_MOCK=0` arms the paid path, which isn't wired yet). **Phase 1 makes zero external API calls**
and imports zero paid SDKs. The demo CSV loads on page load — nothing to upload.

## Demo script

1. Ask the headline question: **"What was EMEA's gross margin percentage in Q3 2025?"**
   The correct, hand-verified answer from the dataset is **35.898%** — EMEA collapses from 48.3407%
   in Q2 while company-wide revenue still grows +3.6321%. (In mock mode the stand-in engine returns
   a fixed placeholder figure; the real number lands when Fireworks + Daytona are wired in Phases
   2–4. The answer key is in `eval/questions.json`, checked by `eval/verify-answers.py`.)
2. Show the collapsible code and the source cells under the number — that's the live grounding.
3. Trigger the **unverified** path by putting the word **`fail`** in the question (e.g. "show me a
   fail case"). Two attempts run, both error, and Vera blocks the answer instead of guessing.

## Architecture (PRD §3)

1. Upload (or use the baked-in) CSV → Fireworks writes pandas code from the schema + question.
2. A warm Daytona sandbox executes that code against the real CSV.
3. The safeguard checks: did code actually run, and is the value traceable to real cells?
4. Pass → number + executed code + source cells, spoken by ElevenLabs. Fail → feed stderr back and
   retry (max 2), then a clean "couldn't verify" state.
5. Separately and offline, Braintrust scores the ~15-question benchmark vs a no-execution baseline.

The four stages (*writing code → running in sandbox → verifying → done*) stream to the UI live.

## Repo map

| Path | What's there |
| --- | --- |
| `app/` | Next.js App Router pages + the `/api/analyze` route (the backend) |
| `components/` | UI: dropzone, question box, stage timeline, result / unverified cards |
| `lib/` | Domain contracts, CSV parsing, runtime config, the mock engine |
| `hooks/` | `use-analysis.ts` — client-side consumer of the SSE stream |
| `data/` | The demo dataset + its generated TypeScript import surface |
| `eval/` | Benchmark questions, answer key, and the local verifier |
| `scripts/` | `build-demo-data.mjs`, which generates `data/demo.ts` from the CSV |

**Contract files — change these only with care, everything else depends on them:**

- `lib/types.ts` — the domain contract. `Finding` is a union where the `unverified` branch
  structurally has no `value` field, so no code path can leak an unproven number to the UI.
- `lib/analyst.ts` — the swap point. Mock today, real orchestrator in Phases 2–4; one line changes.
- `lib/stream.ts` — the SSE codec shared by the API route and the client hook.

## The dataset

`data/demo-business.csv` is 24 months × 3 regions × 3 product lines, and it is deliberately messy so
a no-execution model gets the wrong answer:

- a currency-formatted string (`"$12,400"`) in the `revenue` column
- two blank numeric cells
- one month written `03/2024` instead of `2024-03`
- one exact duplicate row

Full trap list, the cleaning rules, and the worked headline answer: [`data/README.md`](data/README.md).

`data/demo.ts` (`DEMO_CSV`, `DEMO_FILENAME`, `DEMO_QUESTIONS`) is generated, never hand-edited.
After any CSV change:

```bash
node scripts/build-demo-data.mjs   # rewrites data/demo.ts
python3 eval/verify-answers.py     # re-checks every expected answer against the CSV
```

## Sponsor tools

| Tool | Role | Status |
| --- | --- | --- |
| Fireworks | Writes the pandas analysis code | Phase 2 — not wired |
| Daytona | Isolated sandbox that executes the code | Phase 3 — not wired |
| Braintrust | Offline benchmark score vs no-execution baseline | Phase 5 — questions + answer key wired, scoring not run |
| ElevenLabs | Speaks the verified finding | Phase 6 — not wired |

Dev-time tools (not product features): **CodeRabbit** reviews every PR into `dev`, and **Herdr**
runs the parallel build agents.

Currently wired end to end: the mock spine (`lib/mock/engine.ts`), the demo dataset, and the
offline answer key.
