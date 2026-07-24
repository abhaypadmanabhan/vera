/**
 * Thin client-side stub for the demo UI.
 *
 * The real Superstore CSV (~2.3 MB) is read server-side via lib/datasets.ts —
 * it must never be embedded here. Demo analysis runs with datasetId "superstore";
 * this module only supplies example questions and a placeholder CsvPayload so the
 * existing page import keeps compiling until the UI agent drops it.
 */

export const DEMO_FILENAME: string = "superstore.csv";

/** Placeholder only — not the real dataset. Server loads data/superstore.csv. */
export const DEMO_CSV: string =
  "OrderID,OrderDate,Sales\nCA-PLACEHOLDER,08/11/2018,0\n";

export const DEMO_QUESTIONS: string[] = [
  "What were total sales in Q3 2018?",
  "What were total sales in July 2018?",
  "How many unique orders are in the dataset?",
];
