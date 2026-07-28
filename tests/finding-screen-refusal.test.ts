import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FindingScreen } from "@/components/vera/finding-screen";
import type { DatasetSummary, Finding } from "@/lib/types";

const dataset: DatasetSummary = {
  id: "sales",
  filename: "sales.csv",
  rowCount: 1,
  columns: [],
  duplicateRowCount: 0,
  notes: [],
  previewRows: [],
  sizeBytes: 12,
};

describe("guardrail refusal presentation", () => {
  it("presents refusal as Vera's choice and offers answerable alternatives", () => {
    const finding: Finding = {
      verdict: "unverified",
      reason: "question_not_answerable",
      detail: "This file does not include enough information to calculate profit margin.",
      code: null,
      attempts: 0,
    };

    const markup = renderToStaticMarkup(
      createElement(FindingScreen, {
        question: "What was our profit margin?",
        finding,
        dataset,
        onReset: () => undefined,
      }),
    );

    expect(markup).toContain("Vera chose not to answer");
    expect(markup).toContain(
      "This file does not include enough information to calculate profit margin.",
    );
    expect(markup).toContain("Try asking for a total, average, count, comparison, or trend");
    expect(markup).not.toContain("What went wrong");
    expect(markup).not.toContain("attempts");
  });
});
