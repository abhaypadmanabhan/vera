#!/usr/bin/env python3
"""
Dev-only answer-key checker for eval/questions.json.

Recomputes every expected value from data/demo-business.csv with the same
cleaning rules documented in data/README.md and eval/README.md. Fails loudly
on any mismatch (numeric-tolerant relative epsilon).

This is local tooling — not app code. The app's only Python runs inside Daytona.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "demo-business.csv"
QUESTIONS_PATH = ROOT / "eval" / "questions.json"

REL_EPS = 1e-6
ABS_FLOOR = 1e-9


def load_clean(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df = df.drop_duplicates()

    def normalize_month(m: str) -> str:
        m = m.strip()
        if re.fullmatch(r"\d{4}-\d{2}", m):
            return m
        matched = re.fullmatch(r"(\d{1,2})/(\d{4})", m)
        if matched:
            return f"{matched.group(2)}-{int(matched.group(1)):02d}"
        raise ValueError(f"Unrecognized month format: {m!r}")

    def parse_money(v: str) -> float:
        v = v.strip()
        if v == "":
            return float("nan")
        return float(v.replace("$", "").replace(",", ""))

    def parse_num(v: str) -> float:
        v = v.strip()
        if v == "":
            return float("nan")
        return float(v)

    out = df.copy()
    out["month"] = out["month"].map(normalize_month)
    for col in ("revenue", "cogs", "marketing_spend"):
        out[col] = out[col].map(parse_money)
    for col in ("units", "headcount"):
        out[col] = out[col].map(parse_num)
    return out


def nearly_equal(
    actual: float,
    expected: float,
    *,
    rel_eps: float = REL_EPS,
    abs_floor: float = ABS_FLOOR,
) -> bool:
    return abs(actual - expected) <= max(abs_floor, rel_eps * abs(expected))


def gross_margin_pct(frame: pd.DataFrame) -> float:
    rev = float(frame["revenue"].sum())
    cogs = float(frame["cogs"].sum())
    if rev == 0:
        raise ZeroDivisionError("revenue sum is 0")
    return (rev - cogs) / rev * 100.0


def compute_answers(df: pd.DataFrame) -> dict[str, float]:
    emea_q3 = df[
        (df["region"] == "EMEA")
        & (df["month"].isin(["2025-07", "2025-08", "2025-09"]))
    ]
    emea_q2 = df[
        (df["region"] == "EMEA")
        & (df["month"].isin(["2025-04", "2025-05", "2025-06"]))
    ]
    emea_core_q3 = emea_q3[emea_q3["product_line"] == "Core"]
    co_q3 = float(
        df[df["month"].isin(["2025-07", "2025-08", "2025-09"])]["revenue"].sum()
    )
    co_q2 = float(
        df[df["month"].isin(["2025-04", "2025-05", "2025-06"])]["revenue"].sum()
    )
    na_plus_jan = df[
        (df["month"] == "2025-01")
        & (df["region"] == "North America")
        & (df["product_line"] == "Plus")
    ]
    apac_ent_mar = df[
        (df["month"] == "2024-03")
        & (df["region"] == "APAC")
        & (df["product_line"] == "Enterprise")
    ]
    na_core_jun = df[
        (df["month"] == "2024-06")
        & (df["region"] == "North America")
        & (df["product_line"] == "Core")
    ]
    df_2025 = df[df["month"].str.startswith("2025")]
    top_rev = float(df_2025.groupby("region")["revenue"].sum().max())
    df_2024 = df[df["month"].str.startswith("2024")]
    emea_dec = df[(df["month"] == "2025-12") & (df["region"] == "EMEA")]

    return {
        "q01_total_revenue": round(float(df["revenue"].sum()), 2),
        "q02_total_units": round(float(df["units"].sum(skipna=True)), 2),
        "q03_na_plus_jan_2025_revenue": round(float(na_plus_jan["revenue"].iloc[0]), 2),
        "q04_emea_q3_2025_gross_margin_pct": round(gross_margin_pct(emea_q3), 4),
        "q05_emea_core_q3_2025_gross_margin_pct": round(
            gross_margin_pct(emea_core_q3), 4
        ),
        "q06_emea_q2_2025_gross_margin_pct": round(gross_margin_pct(emea_q2), 4),
        "q07_company_q3_vs_q2_2025_revenue_growth_pct": round(
            (co_q3 - co_q2) / co_q2 * 100.0, 4
        ),
        "q08_apac_enterprise_mar_2024_revenue": round(
            float(apac_ent_mar["revenue"].iloc[0]), 2
        ),
        "q09_na_core_jun_2024_revenue": round(float(na_core_jun["revenue"].iloc[0]), 2),
        "q10_total_cogs": round(float(df["cogs"].sum()), 2),
        "q11_total_marketing_spend": round(
            float(df["marketing_spend"].sum(skipna=True)), 2
        ),
        "q12_top_region_2025_revenue": round(top_rev, 2),
        "q13_emea_core_q3_2025_units": round(float(emea_core_q3["units"].sum()), 2),
        "q14_company_2024_gross_margin_pct": round(gross_margin_pct(df_2024), 4),
        "q15_emea_dec_2025_headcount": round(float(emea_dec["headcount"].sum()), 2),
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

    df = load_clean(CSV_PATH)
    if len(df) != 216:
        print(f"FAIL: expected 216 clean rows after dedupe, got {len(df)}", file=sys.stderr)
        return 1

    computed = compute_answers(df)
    failures: list[str] = []

    for item in questions:
        qid = item["id"]
        expected = float(item["expected"])
        if qid not in computed:
            failures.append(f"{qid}: no recomputation defined")
            continue
        actual = float(computed[qid])
        if not nearly_equal(actual, expected, rel_eps=rel, abs_floor=abs_floor):
            failures.append(
                f"{qid}: expected {expected} but recomputed {actual} "
                f"(tol max({abs_floor}, {rel}*|{expected}|))"
            )

    extra = set(computed) - {q["id"] for q in questions}
    missing = {q["id"] for q in questions} - set(computed)
    if extra:
        failures.append(f"extra recomputations not in questions.json: {sorted(extra)}")
    if missing:
        failures.append(f"questions missing recomputation: {sorted(missing)}")

    trap_count = sum(1 for q in questions if q.get("trap") or q.get("difficulty") == "trap")
    print(f"dataset: {CSV_PATH.relative_to(ROOT)} ({len(df)} clean rows)")
    print(f"questions: {len(questions)} ({trap_count} trap)")
    print(f"scoring: relative_epsilon={rel} absolute_floor={abs_floor}")

    if failures:
        print(f"FAIL: {len(failures)} mismatch(es)")
        for line in failures:
            print(f"  - {line}")
        return 1

    print("OK: all expected answers match recomputation from CSV")
    for item in questions:
        qid = item["id"]
        print(f"  ✓ {qid}: {computed[qid]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
