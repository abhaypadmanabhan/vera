# Vera

**An AI business analyst that proves every number before she says it.**

You ask a question about your data. Vera profiles the file, writes real pandas, runs it in an
isolated Daytona sandbox, and shows you the number **next to the code that produced it and the
actual cells it read**. If the value can't be traced back to real cells, she shows **no number at
all** and says so.

Built for the Daytona HackSprint, 24 July 2026.

---

## The 30-second version

We pointed Vera at a real 9,994-row Superstore orders file and asked for Q3 2018 sales. There are
three plausible answers and two of them are wrong:

| Answer | Where it comes from |
|---|---|
| **$50,517.26** | what a naive `pd.to_datetime` returns — it silently drops **5,952 of 9,994 rows** |
| **$131,098.53** | what the file's own `Order Quarter` column gives — it disagrees with the real order dates on **2,889 rows** |
| **$143,787.36** | the truth |

None of them crash. That is the problem: a language model reading a spreadsheet states a number
with total confidence and gives you no way to check it.

So before any model sees the file, Vera **profiles it deterministically** and proves what she can:

```
OrderDate is DD/MM/YYYY
  5,952 values have a first component above 12, which cannot be a month.
  0 values argue the other way.

"Order Quarter" disagrees with the quarter of "OrderDate"
  2,889 of 9,994 rows. Code that trusts it runs cleanly and returns a wrong number.
```

Both facts go into the prompt with their counts. The model then writes
`pd.to_datetime(df['OrderDate'], format='%d/%m/%Y')` and explains itself: *"derive the quarter from
the date, not the unreliable Order Quarter column."*

Every claim is a count you can check yourself.

## What "verified" honestly means

Two different claims. We never blur them, because the distinction is the product.

1. **Live, per answer — real.** The number came from code that actually executed on the real cells
   of your file. The code, the exit status and the cells it read are all on screen. If it cannot be
   traced, no number is released. There is no guess fallback.
2. **Aggregate, measured offline.** On a fixed 21-question benchmark, Vera scores **100% (21/21)**
   against **47.6%** for a no-execution baseline. That is a pre-computed dashboard figure, not a
   per-answer guarantee.

The baseline is deliberately fair: Vera's model never sees the 2.3 MB file either — it gets the
schema profile plus sample rows. The baseline gets **identical context** and simply isn't allowed
to execute. Same prompt, one runs code. Given that, it still failed all three date-derived
questions, total profit, profit margin, the Tables loss and 2018→2019 growth.

**What we do not claim:** that Vera can tell you a cleanly-executing number is the *wrong answer to
your question*. At demo time there is no answer key. What she can do is refuse to release a number
she cannot trace, and prove the schema facts her code relied on.

## Run it

```bash
pnpm install
pnpm dev
```

**No API keys. No `.env.local`.** Mock mode is the default and the whole app runs end to end with
zero external calls.

To run it live (spends credits), copy `.env.example` to `.env.local`, fill in the keys, and:

```bash
VERA_MOCK=0 pnpm dev
```

After any live session, delete the sandbox so it stops costing money:

```bash
set -a; . ./.env.local; set +a
VERA_LIVE=1 VERA_SANDBOX_ID=<id> pnpm vitest run tests/reap.live.test.ts
```

## Verify the claims yourself

```bash
pnpm test                       # unit + contract tests; live tests are gated and never spend
python3 eval/verify-answers.py  # recomputes all 21 benchmark answers from the CSV
```

Live checks (these spend credits, skipped unless `VERA_LIVE=1`):

```bash
set -a; . ./.env.local; set +a
VERA_LIVE=1 VERA_MOCK=0 pnpm vitest run tests/live-e2e.test.ts   # Fireworks -> Daytona -> safeguard
```

## Architecture

```
Question + CSV
      │
      ├─► deterministic profiler ──► proven schema facts, each with its counts
      │
      ▼
  Fireworks ──writes pandas──► Daytona sandbox ──executes──► result
                                                                │
                    the safeguard: exit 0? finite value?        │
                    every column traceable to the real file? ───┤
                                                                │
          pass ─► number + code + source cells + evidence ──────┤
          fail ─► stderr back to Fireworks, retry (max 2) ──────┘
          still failing ─► no number released
```

TypeScript / Next.js throughout. The **only** Python is the analysis code generated to run inside
the sandbox. Runs locally — serverless timeouts would kill the sandbox call.

## Repo map

| Path | What lives there |
|---|---|
| `lib/types.ts` | the contract. `Finding` is a discriminated union — the `unverified` branch has **no `value` field**, so leaking an unproven number is a compile error |
| `lib/profile/profiler.ts` | the deterministic profiler; proves date formats, cross-checks period columns, refuses to guess |
| `lib/verify.ts` | the safeguard — checks provenance, not correctness |
| `lib/analyst.ts` | the one-line mock ↔ real swap point |
| `lib/deck.ts` | turns a verified finding into keynote slides with narration beats |
| `lib/daytona/`, `lib/fireworks/`, `lib/codegen/`, `lib/voice/` | the four integrations |
| `eval/` | 21 hand-verified questions, the answer-key script, the recorded benchmark result |
| `data/superstore.csv` | the demo dataset, served from the server — the client never receives it |
| `docs/` | SDK research and the submission writeup |
| `tasks/` | the phase plan and the checkpoint log |

## Sponsor tools

- **Daytona** — one warm sandbox held as a server-side singleton and reused across questions, the
  dataset uploaded once per sandbox lifetime, a liveness probe that recreates a dead handle,
  per-execution timeouts and explicit teardown.
- **Fireworks** — OpenAI-compatible client, `accounts/fireworks/models/glm-5p2` (confirmed against
  the live model list, not guessed), JSON-schema structured output validated with zod.
- **Braintrust** — the offline benchmark behind the accuracy figure.
- **ElevenLabs** — Vera presents the finding out loud. Only a *verified* finding can be spoken;
  that's enforced by the type system.
- **CodeRabbit** and **Herdr** — dev-time. Herdr ran Claude, Codex and Cursor agents in parallel
  isolated worktrees behind a single merge gate.

## Licence

MIT.
