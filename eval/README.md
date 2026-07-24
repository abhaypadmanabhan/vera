# Eval — answer key (money-free groundwork)

Offline benchmark assets for issue #15. **No Braintrust, no Fireworks, no API keys.**

## Files

| File | Role |
| --- | --- |
| `questions.json` | ~15 hand-verified Q&A over `data/demo-business.csv` |
| `verify-answers.py` | Local pandas checker — recomputes every expected value |

## Run the checker

```bash
python3 eval/verify-answers.py
```

Requires local `pandas` only. Exits non-zero on any mismatch.

## Numeric-tolerant scoring

Answers are floats. Do **not** compare with string equality.

Rule (also stored under `questions.json` → `scoring`):

```
pass if abs(actual - expected) <= max(absolute_floor, relative_epsilon * abs(expected))
```

Defaults:

- `relative_epsilon`: `1e-6`
- `absolute_floor`: `1e-9` (guards expected ≈ 0)

This is the scorer contract future Braintrust / autoevals wiring must use.

## Trap questions

At least three questions are marked `"difficulty": "trap"` / `"trap": true`. They target the planted messiness in the CSV (currency string, blanks, bad date, duplicate). A no-execution baseline is expected to miss these.

## Baseline runner (defined, not executed here)

Per PRD §7 — same `questions.json`, CSV text in-context, **no code execution**. That path spends Fireworks credits and is out of scope for this slice.

Contract for the later credit-spending phase:

1. For each question, prompt the model with the full CSV + question.
2. Parse a single numeric answer from the completion.
3. Score with the relative-epsilon rule above.
4. Report accuracy vs Vera (code-execution) on the same key.

Do not implement or call that runner until the builder explicitly approves spend.
