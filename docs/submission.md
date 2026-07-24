# Devpost submission — Vera

Draft. Braintrust numbers are final and filled in.
Submission due **3:30pm PDT**. Checklist at the bottom.

---

## Team name

**Vera** — one builder, commanding a fleet of parallel coding agents.

## Tagline

**An AI business analyst that proves every number before she says it.**

## The problem

Every founder and ops lead has the same two options with a spreadsheet: do the analysis yourself, or
ask an AI and hope. The second is faster and quietly dangerous — a language model reading a CSV
does arithmetic by pattern-matching, states the result with total confidence, and gives you no way
to check it. So the people who most need the answer are the least able to trust it.

The failure is not that AI is bad at maths. It is that **you cannot see where the number came from.**

## How she presents it

Vera does not hand you a page. She **presents**, like an analyst walking you through a keynote:
the question, the headline figure, one slide per fact she proved about your data, the code that
ran, the cells it read, and a summary dashboard as the finale. A presenter marker moves across each
slide to the thing she is talking about, and she says it out loud. When she stops, you can jump to
any slide — and if your follow-up is something she already covered, she goes back to that slide and
references it instead of starting over.

## What Vera does

You ask a question about your data. Vera profiles the file, writes real pandas code, runs it in an
isolated Daytona sandbox, and shows you the number **next to the code that produced it and the
actual cells it read**. If the code fails, or the value cannot be traced back to real cells, she
retries — and if she still cannot prove it, **she shows no number at all** and says so.

That last part is the product. Vera would rather tell you she does not know.

## The thing we did not expect

We ran Vera against a real 9,994-row Superstore orders file. It contains a trap we did not plant,
and it is the best argument for this product we could have asked for.

`OrderDate` is formatted `DD/MM/YYYY`. Pandas defaults to month-first. So a perfectly reasonable
analysis silently drops **5,952 of 9,994 rows** — no error, no warning — and reports Q3 2018 sales
as **$50,517**.

Worse: the file also has an `Order Quarter` column that *disagrees with its own order dates* on
**2,889 rows**. Our first live model run reached for that convenient column and returned
**$131,098**. Wrong, and it executed perfectly cleanly.

The correct answer is **$143,787.36**.

Three plausible answers to one question, two of them wrong, none of them crashing. This is exactly
how analysis goes wrong in real companies, and exactly what no amount of model confidence can fix.

**So Vera profiles the file deterministically before any model sees it.** She proves the date format
by counting: 5,952 values have a first component above 12 and therefore cannot be months; 0 values
argue the other way. She cross-checks the stated `Order Quarter` against the quarter derived from
the proven dates and counts the disagreements. Both facts go into the prompt with their evidence,
and both are shown on screen with the counts behind them.

With those facts in hand the model writes `pd.to_datetime(df['OrderDate'], format='%d/%m/%Y')` and
explains itself: *"derive the quarter from the date, not the unreliable Order Quarter column."*

None of that is inference by vibes. Every claim is a count you can check.

## What "verified" honestly means

We are careful here, because it is the whole pitch and a judge should probe it.

1. **Live, per answer — real.** The number was produced by code that actually executed on the real
   cells of your file. We show the code, the exit status, and the cells it read. If it cannot be
   traced, no number is released.
2. **Aggregate, measured offline.** On our fixed 21-question benchmark, Vera scores **100%
   (21/21)** vs **47.6%** for a no-execution baseline. That is a pre-computed dashboard figure, not
   a per-answer guarantee.

   The interesting number is the baseline's. Given *identical* context — the same schema profile and
   the same sample rows — and asked only to not execute code, it failed **all three** date-derived
   questions, plus total profit, profit margin, West sales, Technology profit, the Tables loss,
   average discount, 2019 sales and 2018→2019 growth. It got rows-vs-unique-orders right. Vera's
   100% is not "the model is smart"; it is "the model wrote code and the code ran on the real
   cells."


**What we do not claim:** that Vera can tell you a cleanly-executing number is the *wrong answer to
your question*. At demo time there is no answer key. What she can do is refuse to release a number
she cannot trace — and prove the schema facts her code relied on.

The baseline comparison is deliberately fair: Vera's model never sees the 2.3 MB file either. It
gets the schema profile plus sample rows. The baseline gets **identical context** and simply is not
allowed to execute. Same prompt, one runs code.

## Architecture

```
Question + CSV
      │
      ├─► deterministic profiler ──► proven schema facts (+ counts as evidence)
      │
      ▼
  Fireworks  ──writes pandas──►  Daytona sandbox  ──executes──►  result
                                                                    │
                        the safeguard: exit 0? value non-null?      │
                        every column traceable to the real file? ───┤
                                                                    │
              pass ─► number + code + source cells + evidence ──────┤
              fail ─► stderr back to Fireworks, retry (max 2) ──────┘
              still failing ─► "no number released"

  (offline) Braintrust: 21 Q&A, Vera vs no-execution baseline ─► the accuracy figure
```

TypeScript / Next.js throughout. The only Python is the analysis code generated to run inside the
sandbox. Runs locally — serverless timeouts would kill the sandbox call.

## Sponsor tools, and how they are actually integrated

- **Daytona — the hero.** One warm sandbox held as a server-side singleton and reused across
  questions, with the dataset uploaded once per sandbox lifetime, a liveness probe that recreates a
  dead handle, per-execution timeouts, and explicit teardown so nothing keeps burning. Sandbox up in
  0.3s; generated pandas executes in ~830ms. This is what makes running model-written code safe
  enough to do at all.
- **Fireworks — the brain.** OpenAI-compatible client against
  `https://api.fireworks.ai/inference/v1`, `accounts/fireworks/models/glm-5p2` (confirmed against
  the live `/v1/models` list, not guessed). Structured JSON-schema output returns
  `{ code, explanation, columnsUsed }`, validated with zod — no regex-scraping of prose. The prompt
  carries the profiler's proven facts, never the whole file.
- **Braintrust — the proof.** Offline eval over 21 hand-verified questions, Vera versus a
  no-execution baseline on identical context, numeric-tolerant scoring. Produces the headline
  accuracy figure and the dashboard: **Vera 100% vs baseline 47.6%**.
  Dashboard: https://www.braintrust.dev/app/Padzy/p/Vera%20Accuracy%20Benchmark/experiments/vera-vs-baseline-2026-07-24T20-28-28-903Z
- **ElevenLabs — the voice.** Vera speaks the finding aloud. Only a *verified* finding can be
  spoken — that is enforced by the type system, not by convention.
- **CodeRabbit** (dev-time): reviewed every pull request on this repo.
- **Herdr** (dev-time): ran the parallel coding agents — Claude, Codex and Cursor working
  simultaneously in isolated git worktrees with one merge gate.

## How we built it

One builder orchestrating parallel agents in isolated worktrees, each with an explicit file-
ownership contract so slices never collided, merged behind a single gate. Every phase shipped as a
pull request. Money discipline was enforced in the repo itself: mock mode is the default, the whole
app runs end to end with **zero API keys**, and every paid integration is hard-blocked until it is
explicitly turned on.

## What we learned

The safeguard caught our own bug before we finished writing it. On the first live run the model
printed its answer as a labelled object, the parser could not read it, and the run came back
**unverified** rather than shipping an unparsed figure. It was doing its job on us. We widened the
contract to unwrap an unambiguous single-value wrapper — and kept blocking ambiguous ones, because
"which of these three numbers is the answer?" is not a question we should guess at.

## Try it

```bash
pnpm install
pnpm dev            # runs fully mocked, zero API keys needed
```

Live mode needs Fireworks + Daytona keys in `.env.local` and `VERA_MOCK=0`.

---

# Demo video script (target: under 2 minutes)

**0:00–0:20 — the cold open.** Split screen. A normal AI is asked "what were total sales in Q3
2018?" and answers **$50,517** with complete confidence. Beat. Caption: *it silently dropped 5,952
of 9,994 rows.*

**0:20–0:50 — Vera.** Same question. The four stages move: writing code → running in sandbox →
verifying → done. Vera answers **$143,787.36** — and next to it, the code that ran, the cells it
read, and the proof: `OrderDate is DD/MM/YYYY — 5,952 values have a first component above 12, which
cannot be a month. 0 argue otherwise.`

**0:50–1:10 — the second trap.** "There's a column in this file called Order Quarter. It disagrees
with the actual order dates on 2,889 rows. Vera checked, and told the model not to trust it." Show
the cross-check evidence.

**1:10–1:30 — the refusal.** Force a run she cannot trace. **No number appears.** "She'd rather tell
you she doesn't know."

**1:30–1:50 — the proof at scale.** Braintrust dashboard: **100% vs 47.6%** on 21 questions
against a no-execution baseline with identical context. Name what the baseline missed — all three
date questions, total profit, margin, the Tables loss.

**1:50–2:00 — close.** "Every number, computed and traceable. Vera."

---

# Submission checklist (PRD §10)

- [ ] Unique team name
- [ ] Demo video, under 2 minutes
- [ ] Problem + impact
- [ ] Technical architecture
- [ ] Sponsor tools + how each is integrated
- [x] Public GitHub repo — https://github.com/abhaypadmanabhan/vera (made public 13:18 PDT)
- [x] Braintrust figures and dashboard link filled in
- [ ] Backup demo clip recorded in case live fails on stage
- [ ] CodeRabbit comments on both PRs triaged
