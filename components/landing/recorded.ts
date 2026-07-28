/*
 * Every figure the landing page states, in one place, with its provenance.
 *
 * PRD §6 and CLAUDE.md: nothing here is invented. Each value below is either a
 * recorded result from a real run against `data/superstore.csv`, or a count
 * taken straight off that file. The benchmark numbers are NOT here — they are
 * read from `eval/results.json` at build time by `app/page.tsx`, because they
 * are a different kind of claim (measured accuracy, aggregate) and must never
 * drift from the file that produced them.
 *
 * Re-derivable at any time, with no API key and no network:
 *
 *   python3 - <<'PY'
 *   import csv, datetime
 *   rows = list(csv.DictReader(open("data/superstore.csv")))
 *   q3 = [r for r in rows
 *         if (d := datetime.datetime.strptime(r["OrderDate"], "%d/%m/%Y")).year == 2018
 *         and (d.month - 1) // 3 == 2]
 *   print(len(rows), len(q3), round(sum(float(r["Sales"]) for r in q3), 2))
 *   PY
 *   # 9994 740 143787.36
 */

export const FILE = {
  name: "superstore.csv",
  rows: 9_994,
} as const;

export const QUESTION = "What were total sales in Q3 2018?";

/**
 * The recorded run. Timing and exit status are from the live end-to-end run
 * logged in `tasks/checkpoints.md` CP-4; the figure matches the answer key in
 * `eval/results.json` (`q18_sales_2018_q3`, expected 143787.36).
 */
export const VERIFIED = {
  figure: "$143,787.36",
  claim: "Total sales in Q3 2018.",
  matchedRows: 740,
  exit: "Exit 0 in 828 ms",
  /** The same timing without the exit code, for surfaces that carry no jargon. */
  durationLabel: "828 ms",
  columns: ["OrderDate", "Sales"],
} as const;

/**
 * The pandas that produced it. The generator is required to parse a proven date
 * column with its proven format — `lib/codegen/python-policy.ts` rejects the
 * code otherwise — so the `%d/%m/%Y` line is not a stylistic choice, it is the
 * thing being enforced.
 */
export const CODE: readonly string[] = [
  "import pandas as pd",
  "",
  'df = pd.read_csv("/workspace/data.csv")',
  "",
  "# OrderDate is %d/%m/%Y — proven from the data, not the header.",
  'dates = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")',
  "",
  "q3 = (dates.dt.year == 2018) & (dates.dt.quarter == 3)",
  'print(round(df.loc[q3, "Sales"].sum(), 2))',
];

/**
 * Real cells, quoted verbatim. `line` is the line number in `superstore.csv`
 * with the header as line 1 — every one of these has a first date component
 * above 12, so it cannot be a month.
 */
export const CELLS = [
  { line: 44, date: "17/07/2018", sales: "77.88" },
  { line: 72, date: "18/09/2018", sales: "4.616" },
  { line: 91, date: "17/09/2018", sales: "20.10" },
] as const;

/** The day-first proof, counted deterministically before any model sees the file. */
export const DAY_FIRST = {
  supporting: 5_952,
  contradicting: 0,
} as const;

/**
 * The three answers. All three are recorded results computed from the same
 * file: the naive parse is what month-first `pd.to_datetime` actually returns,
 * and the middle one is what the file's own `Order Quarter` column claims.
 */
export const ANSWERS = [
  {
    figure: "$50,517.26",
    label: "A naive date parse",
    detail:
      "Reads the dates the wrong way round and quietly drops 5,952 of 9,994 rows. It does not crash, and it never mentions it.",
    status: "wrong",
  },
  {
    figure: "$131,098.53",
    label: "The file's own quarter column",
    detail:
      "It is right there in the file, and it disagrees with the real dates on 2,889 rows.",
    status: "wrong",
  },
  {
    figure: VERIFIED.figure,
    label: "Read the dates correctly, then checked them",
    detail: `${DAY_FIRST.supporting.toLocaleString("en-US")} dates start with a number above 12, so they cannot be months. ${DAY_FIRST.contradicting} argue otherwise.`,
    status: "true",
  },
] as const;
