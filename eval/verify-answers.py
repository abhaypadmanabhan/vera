#!/usr/bin/env python3
"""
Dev-only answer-key checker for eval/questions.json (Superstore).

Recomputes every expected value from data/superstore.csv. For date-trap
questions, also recomputes naive_answer under month-first pd.to_datetime
(errors='coerce') and fails loudly on any mismatch.

This is local tooling — not app code. The app's only Python runs inside Daytona.
No Braintrust / Fireworks / Daytona calls. Local pandas only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "superstore.csv"
QUESTIONS_PATH = ROOT / "eval" / "questions.json"

REL_EPS = 1e-6
ABS_FLOOR = 1e-9


def nearly_equal(
    actual: float,
    expected: float,
    *,
    rel_eps: float = REL_EPS,
    abs_floor: float = ABS_FLOOR,
) -> bool:
    return abs(actual - expected) <= max(abs_floor, rel_eps * abs(expected))


def values_match(actual: Any, expected: Any, *, rel_eps: float, abs_floor: float) -> bool:
    if isinstance(expected, str):
        return str(actual).strip().casefold() == expected.strip().casefold()
    return nearly_equal(float(actual), float(expected), rel_eps=rel_eps, abs_floor=abs_floor)


def load_superstore(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if len(df) != 9994:
        raise ValueError(f"expected 9994 rows, got {len(df)}")
    return df


def compute_answers(df: pd.DataFrame) -> dict[str, Any]:
    """Correct answers — OrderDate parsed day-first."""
    dt = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")
    sales_2018 = float(df.loc[df["OrderYear"] == 2018, "Sales"].sum())
    sales_2019 = float(df.loc[df["OrderYear"] == 2019, "Sales"].sum())
    margins = df.groupby("Category").apply(
        lambda g: float(g["Profit"].sum()) / float(g["Sales"].sum()),
        include_groups=False,
    )

    return {
        "q01_total_sales": round(float(df["Sales"].sum()), 2),
        "q02_total_profit": round(float(df["Profit"].sum()), 2),
        "q03_profit_margin_pct": round(
            float(df["Profit"].sum()) / float(df["Sales"].sum()) * 100.0, 2
        ),
        "q04_region_highest_sales": df.groupby("Region")["Sales"].sum().idxmax(),
        "q05_region_lowest_sales": df.groupby("Region")["Sales"].sum().idxmin(),
        "q06_west_sales": round(float(df.loc[df["Region"] == "West", "Sales"].sum()), 2),
        "q07_most_profitable_category": df.groupby("Category")["Profit"].sum().idxmax(),
        "q08_technology_profit": round(
            float(df.loc[df["Category"] == "Technology", "Profit"].sum()), 2
        ),
        "q09_worst_subcategory": df.groupby("Sub-Category")["Profit"].sum().idxmin(),
        "q10_tables_profit": round(
            float(df.loc[df["Sub-Category"] == "Tables", "Profit"].sum()), 2
        ),
        "q11_top_segment": df.groupby("Segment")["Sales"].sum().idxmax(),
        "q12_avg_discount": round(float(df["Discount"].mean()), 4),
        "q13_total_quantity": int(df["Quantity"].sum()),
        "q14_unique_orders": int(df["OrderID"].nunique()),
        "q15_lowest_margin_category": margins.idxmin(),
        "q16_sales_2019": round(sales_2019, 2),
        "q17_sales_growth_2018_2019": round((sales_2019 / sales_2018 - 1.0) * 100.0, 2),
        "q18_sales_2018_q3": round(
            float(df.loc[(dt.dt.year == 2018) & (dt.dt.quarter == 3), "Sales"].sum()), 2
        ),
        "q19_sales_july_2018": round(
            float(df.loc[(dt.dt.year == 2018) & (dt.dt.month == 7), "Sales"].sum()), 2
        ),
        "q20_sales_2017_q4": round(
            float(df.loc[(dt.dt.year == 2017) & (dt.dt.quarter == 4), "Sales"].sum()), 2
        ),
        "q21_row_count": int(len(df)),
    }


def compute_naive_answers(df: pd.DataFrame) -> dict[str, float]:
    """Wrong answers from naive month-first parse (silently drops day>12 rows)."""
    naive = pd.to_datetime(df["OrderDate"], errors="coerce")
    return {
        "q18_sales_2018_q3": round(
            float(df.loc[(naive.dt.year == 2018) & (naive.dt.quarter == 3), "Sales"].sum()),
            2,
        ),
        "q19_sales_july_2018": round(
            float(df.loc[(naive.dt.year == 2018) & (naive.dt.month == 7), "Sales"].sum()),
            2,
        ),
        "q20_sales_2017_q4": round(
            float(df.loc[(naive.dt.year == 2017) & (naive.dt.quarter == 4), "Sales"].sum()),
            2,
        ),
    }


def main() -> int:
    if not CSV_PATH.is_file():
        print(f"FAIL: missing {CSV_PATH}", file=sys.stderr)
        return 1
    if not QUESTIONS_PATH.is_file():
        print(f"FAIL: missing {QUESTIONS_PATH}", file=sys.stderr)
        return 1

    payload = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    questions = payload["questions"]
    scoring = payload.get("scoring", {})
    rel = float(scoring.get("relative_epsilon", REL_EPS))
    abs_floor = float(scoring.get("absolute_floor", ABS_FLOOR))

    df = load_superstore(CSV_PATH)
    computed = compute_answers(df)
    naive_computed = compute_naive_answers(df)
    failures: list[str] = []

    for item in questions:
        qid = item["id"]
        expected = item["expected"]
        if qid not in computed:
            failures.append(f"{qid}: no recomputation defined")
            continue
        actual = computed[qid]
        if not values_match(actual, expected, rel_eps=rel, abs_floor=abs_floor):
            failures.append(
                f"{qid}: expected {expected!r} but recomputed {actual!r} "
                f"(tol max({abs_floor}, {rel}*|expected|) for numerics)"
            )

        if "naive_answer" in item:
            if qid not in naive_computed:
                failures.append(f"{qid}: naive_answer present but no naive recomputation")
            else:
                naive_actual = naive_computed[qid]
                naive_expected = item["naive_answer"]
                if not values_match(
                    naive_actual, naive_expected, rel_eps=rel, abs_floor=abs_floor
                ):
                    failures.append(
                        f"{qid}: naive_answer expected {naive_expected!r} "
                        f"but recomputed {naive_actual!r}"
                    )

    extra = set(computed) - {q["id"] for q in questions}
    missing = {q["id"] for q in questions} - set(computed)
    if extra:
        failures.append(f"extra recomputations not in questions.json: {sorted(extra)}")
    if missing:
        failures.append(f"questions missing recomputation: {sorted(missing)}")

    trap_count = sum(
        1 for q in questions if q.get("trap") or q.get("difficulty") == "trap"
    )
    date_traps = [q["id"] for q in questions if "naive_answer" in q]
    print(f"dataset: {CSV_PATH.relative_to(ROOT)} ({len(df)} rows)")
    print(f"questions: {len(questions)} ({trap_count} trap, {len(date_traps)} date-naive)")
    print(f"scoring: relative_epsilon={rel} absolute_floor={abs_floor}")
    print(f"unique OrderIDs: {df['OrderID'].nunique()}")
    print(f"null Postal Code: {int(df['Postal Code'].isna().sum())}")
    print(f"duplicate rows: {int(df.duplicated().sum())}")

    if failures:
        print(f"FAIL: {len(failures)} mismatch(es)")
        for line in failures:
            print(f"  - {line}")
        return 1

    print("OK: all expected answers match recomputation from CSV")
    for item in questions:
        qid = item["id"]
        line = f"  ✓ {qid}: {computed[qid]!r}"
        if "naive_answer" in item:
            line += f"  (naive={naive_computed[qid]!r})"
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
