import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkingScreen } from "@/components/vera/working-screen";
import type { StageView } from "@/hooks/use-analysis";

const stages: StageView[] = [
  {
    id: "writing_code",
    status: "complete",
    detail: "Analysis code written",
    attempt: 1,
    elapsedMs: 420,
  },
  {
    id: "running_sandbox",
    status: "active",
    detail: "Executing against the uploaded file",
    attempt: 1,
    elapsedMs: 780,
  },
  {
    id: "verifying",
    status: "pending",
    detail: "",
    attempt: 1,
    elapsedMs: 0,
  },
  {
    id: "done",
    status: "pending",
    detail: "",
    attempt: 1,
    elapsedMs: 0,
  },
];

describe("working screen sponsor stages", () => {
  it("names Fireworks beside code writing and Daytona beside sandbox execution", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkingScreen, {
        question: "What were sales in Q3 2018?",
        stages,
        isRunning: true,
        startedAt: Date.now(),
      }),
    );

    expect(markup).toMatch(/Writing code[\s\S]*Fireworks/);
    expect(markup).toMatch(/Running in sandbox[\s\S]*Daytona/);
  });
});
