import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PrepScreen,
  canAsk,
  chipsFor,
  plainDetail,
  stagesFrom,
  type PrepStageMessage,
} from "@/components/vera/prep-screen";
import { acceptFile } from "@/components/vera/upload-dropzone";
import { LIMITS } from "@/lib/config";
import type { PrepReport } from "@/lib/prepare/run";

function fileOfBytes(bytes: number, name = "netflix.csv"): File {
  return new File(["a".repeat(bytes)], name, { type: "text/csv" });
}

/** The four stages as the route streams them: one message per transition. */
function streamed(stages: readonly PrepStageMessage["stage"][]): PrepStageMessage[] {
  return stages.map((stage) => ({
    stage,
    status: "complete" as const,
    detail: "",
  }));
}

const REPORT_WITH_QUESTIONS: PrepReport = {
  ok: true,
  analysisPath: "/home/daytona/clean.csv",
  fixes: [
    "Dates with a proven order will be made consistent.",
    "Extra spaces around text will be removed.",
  ],
  questions: [
    "How many titles were released each year?",
    "What is the average duration in minutes?",
    "How many distinct countries are listed?",
  ],
  counts: {
    rowsBefore: 8_807,
    rowsAfter: 8_795,
    duplicatesDropped: 12,
    cellsCoerced: 4_310,
  },
};

const FAILED_REPORT: PrepReport = {
  ok: false,
  analysisPath: "/home/daytona/netflix.csv",
  fixes: [],
  questions: [],
  counts: null,
  detail: "Vera could not tidy this file, so she is working from it as it came.",
};

describe("upload and prep", () => {
  it("rejects a non-CSV before any request is made", () => {
    expect(acceptFile(new File(["x"], "a.pdf", { type: "application/pdf" })).ok).toBe(false);
  });

  it("rejects an oversized file before any request is made", () => {
    expect(acceptFile(fileOfBytes(LIMITS.maxCsvBytes + 1)).ok).toBe(false);
  });

  it("rejects an empty file before any request is made", () => {
    expect(acceptFile(fileOfBytes(0)).ok).toBe(false);
  });

  it("accepts a CSV inside the limit", () => {
    expect(acceptFile(fileOfBytes(2_048)).ok).toBe(true);
  });

  it("explains a rejection in plain English, with no code jargon", () => {
    const verdict = acceptFile(new File(["x"], "a.pdf", { type: "application/pdf" }));
    expect(verdict.reason).toBeTruthy();
    expect(plainDetail(verdict.reason ?? "")).toBe(verdict.reason);
  });

  it("renders the prep stages in order from the stream", () => {
    const stages = stagesFrom(streamed(["profiling", "cleaning", "checking", "ready"]));
    expect(stages.map((s) => s.label)).toEqual(["Profiling", "Cleaning", "Checking", "Ready"]);
  });

  it("shows every stage from the start, so nothing pops in", () => {
    const stages = stagesFrom(streamed(["profiling"]));
    expect(stages).toHaveLength(4);
    expect(stages[0]?.status).toBe("complete");
    expect(stages[1]?.status).toBe("pending");
  });

  it("keeps the last status the stream reported for a stage", () => {
    const stages = stagesFrom([
      { stage: "checking", status: "active", detail: "Checking the prepared file." },
      { stage: "checking", status: "failed", detail: "That check did not complete." },
    ]);
    expect(stages[2]?.status).toBe("failed");
    expect(stages[2]?.detail).toBe("That check did not complete.");
  });

  it("shows the file's own questions as chips once ready", () => {
    expect(chipsFor(REPORT_WITH_QUESTIONS)).toHaveLength(REPORT_WITH_QUESTIONS.questions.length);
  });

  it("invents no chips when prep failed", () => {
    expect(chipsFor(FAILED_REPORT)).toEqual([]);
  });

  it("still lets the user ask when prep failed", () => {
    expect(canAsk(FAILED_REPORT)).toBe(true);
  });

  it("still lets the user ask while prep is running", () => {
    expect(canAsk(null)).toBe(true);
  });

  it("drops a detail line carrying a traceback or a pandas term", () => {
    expect(plainDetail('Traceback (most recent call last):\n  KeyError: "Order Date"')).toBe("");
    expect(plainDetail("pandas could not parse df['Sales'] with read_csv")).toBe("");
    expect(plainDetail("Prepared the file without inventing values.")).toBe(
      "Prepared the file without inventing values.",
    );
  });

  it("reads as ready, in plain English, once the report lands", () => {
    const markup = renderToStaticMarkup(
      createElement(PrepScreen, {
        filename: "netflix_titles.csv",
        messages: streamed(["profiling", "cleaning", "checking", "ready"]),
        report: REPORT_WITH_QUESTIONS,
        error: null,
      }),
    );

    expect(markup).toContain("Ready — ask me anything.");
    expect(markup).toContain("Dates with a proven order will be made consistent.");
    expect(markup).not.toMatch(/read_csv|pandas|Traceback|dtype/);
  });

  it("says what it could not do, and never blocks the ask box, when prep failed", () => {
    const markup = renderToStaticMarkup(
      createElement(PrepScreen, {
        filename: "netflix_titles.csv",
        messages: [
          { stage: "profiling", status: "complete", detail: "" },
          {
            stage: "cleaning",
            status: "failed",
            detail: 'Traceback (most recent call last): KeyError: "date_added"',
          },
        ],
        report: FAILED_REPORT,
        error: null,
      }),
    );

    expect(markup).toContain(FAILED_REPORT.detail);
    expect(markup).not.toMatch(/Traceback|KeyError/);
  });
});
