# Demo dataset — Superstore

The one demo CSV for Vera. Served **server-side** from disk (`lib/datasets.ts`); the client
receives schema + preview only. Never embed this file as an inline TypeScript string.

## Files

| File | Role |
| --- | --- |
| `superstore.csv` | Source of truth — 9,994 rows, 22 columns, ~2.3 MB, orders 2016–2019 |
| `demo.ts` | Thin client stub: example questions + placeholder payload for the UI until the page fully drops the old inline-CSV import. **Not** an embedding of the CSV. |

The Phase 1 synthetic sheet lives at `tests/fixtures/mini-business.csv` so vitest never parses 2.3 MB.

## Shape

Columns: `OrderID`, `OrderDate`, `OrderYear`, `Order Quarter`, `ShipDate`, `ShipMode`,
`CustomerID`, `CustomerName`, `Segment`, `Country`, `City`, `State`, `Postal Code`, `Region`,
`ProductID`, `Category`, `Sub-Category`, `ProductName`, `Sales`, `Quantity`, `Discount`, `Profit`.

- **9,994** rows (line items), **5,009** unique `OrderID`s
- Regions: West / East / Central / South
- Categories: Furniture / Office Supplies / Technology

## Planted-vs-inherent messiness

| Issue | Kind | Detail |
| --- | --- | --- |
| `OrderDate` uniformly `DD/MM/YYYY` | Inherent trap | Not mixed free text. Naive `pd.to_datetime` (month-first) silently drops **5,952** rows. Profiler proves day-first: 5,952 values have a first component > 12; zero argue the other way. |
| Null `Postal Code` | Inherent | **11** empty postal codes |
| Duplicate row | Inherent | **1** exact duplicate row |

## One-sentence story

**A month-first parse of OrderDate quietly destroys 60% of the data — 2018 Q3 sales becomes $50,517.26 instead of $143,787.36.**

## Headline demo question

> What were total sales in Q3 2018?

**Correct answer: 143787.36** (parse with `format="%d/%m/%Y"`)

**Naive (month-first) answer: 50517.26**

Full answer key + scoring rule: `eval/questions.json`, verified by `python3 eval/verify-answers.py`.
