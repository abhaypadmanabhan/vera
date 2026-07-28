# Eval — Vera vs no-execution baseline

The 21-question benchmark for the aggregate, pre-computed accuracy claim shown in the demo. This
score is measured accuracy on a fixed answer key; it is not a per-answer guarantee and must never
be presented as one.

## Files

| File | Role |
| --- | --- |
| `questions.json` | 21 hand-verified Q&A over `data/superstore.csv` (`input` / `expected`, Braintrust-ready) |
| `verify-answers.py` | Local pandas checker — recomputes every expected value (and every `naive_answer`) |
| `results.json` | Last recorded live run, including both answers, both scores, headline percentages, and dashboard URL |
| `superstore-questions.json` / `.md` | Original 17 verified Q&A (answers unchanged; kept as provenance) |

## Run the checker

```bash
python3 eval/verify-answers.py
```

Requires local `pandas` only. Exits non-zero on any mismatch and makes no paid calls.

Run the offline scorer tests:

```bash
pnpm exec vitest run --config scripts/eval/vitest.config.ts
```

## Numeric-tolerant scoring

Answers may be floats or strings. Strings compare case-insensitively after trimming. Numerics use:

```
pass if abs(actual - expected) <= max(absolute_floor, relative_epsilon * abs(expected))
```

Defaults (also under `questions.json` → `scoring`):

- `relative_epsilon`: `1e-4`
- `absolute_floor`: `1e-9` (guards expected ≈ 0)

Missing or unparseable answers score 0 instead of crashing the run. The Braintrust scorer uses
`autoevals` `ExactMatch` on the binary result of this deterministic tolerance check.

## Question mix (21)

| Kind | Count | Examples |
| --- | --- | --- |
| Original Superstore Q&A (unchanged answers) | 17 | totals, regions, categories, `OrderYear` sales |
| Date-derived traps (`naive_answer` recorded) | 3 | 2018 Q3 sales, July 2018, 2017 Q4 |
| Rows vs unique orders | 1 (+ q14 already) | 9,994 rows vs 5,009 `OrderID`s |

Date traps only come out right if `OrderDate` is parsed with `format="%d/%m/%Y"`. A naive month-first `pd.to_datetime` silently drops 5,952 rows — the wrong figure is stored as `naive_answer` so the baseline comparison is concrete.

Headline demo question: **What were total sales in Q3 2018?** → **143787.36** (naive: **50517.26**).

## Why the baseline is fair

Vera's model only ever sees the **schema profile plus sample rows** — never the 2.3 MB file. The no-execution baseline gets **identical context** and is simply not allowed to run code. Same prompt, one executes. A judge will ask; write that down.

Both arms use the same Fireworks model and receive the same question, complete deterministic
profile, and same five sample rows. Vera asks the model for pandas and executes it locally with
`python3`; the baseline answers from reading alone. Local execution is equivalent to the product
path for benchmark scoring while avoiding an unapproved Daytona call.

## Run the live benchmark

This spends approved Fireworks and Braintrust credits. It performs 21 questions × 2 arms = 42
model calls in the normal case. A failed arm may retry once, the runner refuses to exceed 84 calls
in one run, and the full benchmark should not be run more than twice.

```bash
FIREWORKS_API_KEY=... BRAINTRUST_API_KEY=... pnpm eval
```

The CLI prints the headline, public Braintrust experiment URL, total live call count, and baseline
misses. It also rewrites `eval/results.json`; the UI must read the aggregate benchmark claim from
that artifact rather than hard-code it.

The Braintrust experiment contains separate `vera_accuracy` and `baseline_accuracy` score columns
and an `arm` metadata field for filtering. Each row records the actual answer; Vera rows also keep
the executed code and declared source columns.
