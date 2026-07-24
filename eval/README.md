# Eval — Superstore answer key (money-free groundwork)

Offline benchmark assets for issue #15 / CP-2. **No Braintrust, no Fireworks, no API keys.**

## Files

| File | Role |
| --- | --- |
| `questions.json` | 21 hand-verified Q&A over `data/superstore.csv` (`input` / `expected`, Braintrust-ready) |
| `verify-answers.py` | Local pandas checker — recomputes every expected value (and every `naive_answer`) |
| `superstore-questions.json` / `.md` | Original 17 verified Q&A (answers unchanged; kept as provenance) |

## Run the checker

```bash
python3 eval/verify-answers.py
```

Requires local `pandas` only. Exits non-zero on any mismatch.

## Numeric-tolerant scoring

Answers may be floats or strings. Strings compare exactly. Numerics use:

```
pass if abs(actual - expected) <= max(absolute_floor, relative_epsilon * abs(expected))
```

Defaults (also under `questions.json` → `scoring`):

- `relative_epsilon`: `1e-6`
- `absolute_floor`: `1e-9` (guards expected ≈ 0)

This is the scorer contract future Braintrust / autoevals wiring must use.

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

## Braintrust mapping (defined, not executed)

Fields map cleanly:

- `input` → Braintrust `input` (the question string)
- `expected` → Braintrust `expected` (number or label)

**Do not install or call Braintrust here.** That is a later, credit-spending phase.

Contract for the later spend-approved phase:

1. For each question, prompt the model with the schema profile + sample rows + question (same context Vera gets).
2. Baseline path: no code execution. Vera path: write + run pandas in Daytona.
3. Score with the relative-epsilon rule above (exact match for labels).
4. Report accuracy vs the no-execution baseline on the same key.

Do not implement or call that runner until the builder explicitly approves spend.
