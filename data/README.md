# Demo dataset

Baked-in business CSV for the Vera demo and the offline benchmark (`eval/`).

## Files

| File | Role |
| --- | --- |
| `demo-business.csv` | Source of truth (~24 months × 3 regions × 3 product lines + traps) |
| `demo.ts` | App import surface (`DEMO_CSV`, `DEMO_FILENAME`, `DEMO_QUESTIONS`) |

Regenerate `demo.ts` after any CSV edit:

```bash
node scripts/build-demo-data.mjs
```

The script embeds the CSV text verbatim so the two can never drift. `git diff` must be empty after a regen when the CSV is unchanged.

## One-sentence story

**EMEA's gross margin collapses in Q3 2025 (Core COGS spike) while company-wide revenue still grows.**

A judge reading the sheet should see North America and APAC humming along, EMEA Core quietly going from a healthy ~42% margin to mid-single digits in Jul–Sep 2025, and the company topline still up quarter-over-quarter.

## Headline demo question

> What was EMEA's gross margin percentage in Q3 2025?

**Correct answer: 35.898%**

Computed as `(sum(revenue) − sum(cogs)) / sum(revenue) × 100` for `region = EMEA` and `month ∈ {2025-07, 2025-08, 2025-09}`, after cleaning (see below).

Contrast:

- EMEA Q2 2025 gross margin: **48.3407%**
- EMEA Core alone in Q3 2025: **5.3163%** (the collapse is concentrated here)
- Company revenue Q2 → Q3 2025: **+3.6321%** (topline still grows)

One-click questions in `demo.ts` surface this story.

## Schema

Columns: `month`, `region`, `product_line`, `units`, `revenue`, `cogs`, `marketing_spend`, `headcount`.

- Regions: `North America`, `EMEA`, `APAC`
- Product lines: `Core`, `Plus`, `Enterprise`
- Months: `2024-01` … `2025-12` (canonical `YYYY-MM`)
- Clean logical rows: **216** (24 × 3 × 3). On disk: **217** because of the planted duplicate.

Internal consistency on clean rows: `cogs ≈ revenue × (1 − margin)` and `revenue ≈ units × list price` (Core $48 / Plus $95 / Enterprise $220).

## Planted traps

These exist so a no-execution model (or a naive `df.revenue.sum()`) gets the wrong answer. Vera's generated pandas is supposed to clean them first.

| Trap | Where | What happens if you don't clean |
| --- | --- | --- |
| Currency string | `2024-06`, North America, Core — `revenue` is `"$12,400"` | String concat / dtype object; total revenue is wrong |
| Blank `units` | `2024-09`, APAC, Plus | Coerce/`sum` errors or invented fills |
| Blank `marketing_spend` | `2025-02`, EMEA, Enterprise | Same for marketing totals |
| Inconsistent date | APAC Enterprise March 2024 written as `03/2024` | Filters on `2024-03` miss the row |
| Duplicate row | Exact copy of North America / Plus / `2025-01` appended | Double-counts that key unless `drop_duplicates` |

### Required cleaning (shared by `eval/verify-answers.py`)

1. `drop_duplicates()`
2. Normalize `month`: `MM/YYYY` → `YYYY-MM`
3. Parse money: strip `$` and `,`
4. Coerce blank numerics to NaN; sum with `skipna=True` where blanks are allowed

## How to verify

```bash
python3 eval/verify-answers.py
node scripts/build-demo-data.mjs && git diff --exit-code data/demo.ts
```
