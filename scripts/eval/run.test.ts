import { describe, expect, it } from "vitest";
import {
  buildRecordedResults,
  parseVeraResult,
  pythonSubprocessEnvironment,
  scoreAnswer,
  type ArmRun,
  type EvalQuestion,
} from "./run";

describe("scoreAnswer", () => {
  it("accepts numeric answers within the relative tolerance", () => {
    expect(scoreAnswer(143787.3622, 143787.36, 1e-4, 1e-9)).toBe(1);
  });

  it("rejects numeric answers outside the relative tolerance", () => {
    expect(scoreAnswer(50517.26, 143787.36, 1e-4, 1e-9)).toBe(0);
  });

  it("compares labels case-insensitively after trimming", () => {
    expect(scoreAnswer("  technology ", "Technology", 1e-4, 1e-9)).toBe(1);
  });

  it("scores missing and unparseable answers as zero", () => {
    expect(scoreAnswer(null, 42, 1e-4, 1e-9)).toBe(0);
    expect(scoreAnswer("forty-two", 42, 1e-4, 1e-9)).toBe(0);
  });
});

describe("parseVeraResult", () => {
  it("parses the last scalar VERA_RESULT line", () => {
    expect(parseVeraResult('debug\nVERA_RESULT:"West"\n')).toBe("West");
    expect(parseVeraResult("VERA_RESULT:1\nVERA_RESULT:2\n")).toBe(2);
  });

  it("returns null for missing, non-finite, or structured values", () => {
    expect(parseVeraResult("")).toBeNull();
    expect(parseVeraResult("VERA_RESULT:NaN")).toBeNull();
    expect(parseVeraResult('VERA_RESULT:{"answer":42}')).toBeNull();
  });
});

describe("pythonSubprocessEnvironment", () => {
  it("keeps execution essentials without forwarding API keys", () => {
    const environment = pythonSubprocessEnvironment({
      PATH: "/usr/bin:/bin",
      LANG: "en_US.UTF-8",
      FIREWORKS_API_KEY: "secret",
      BRAINTRUST_API_KEY: "secret",
    });

    expect(environment).toEqual({
      NODE_ENV: "production",
      PATH: "/usr/bin:/bin",
      LANG: "en_US.UTF-8",
    });
    expect(environment).not.toHaveProperty("FIREWORKS_API_KEY");
    expect(environment).not.toHaveProperty("BRAINTRUST_API_KEY");
  });
});

describe("buildRecordedResults", () => {
  it("pairs both arms, computes percentages, and lists baseline misses", () => {
    const questions: EvalQuestion[] = [
      { id: "q1", input: "One?", expected: 1 },
      { id: "q2", input: "Region?", expected: "West" },
    ];
    const runs: ArmRun[] = [
      { id: "q1", arm: "vera", answer: 1, score: 1, attempts: 1, error: null },
      { id: "q1", arm: "baseline", answer: 2, score: 0, attempts: 1, error: null },
      {
        id: "q2",
        arm: "vera",
        answer: "west",
        score: 1,
        attempts: 1,
        error: null,
      },
      {
        id: "q2",
        arm: "baseline",
        answer: " West ",
        score: 1,
        attempts: 1,
        error: null,
      },
    ];

    const result = buildRecordedResults({
      questions,
      runs,
      dashboardUrl: "https://www.braintrust.dev/app/example",
      callCount: 4,
      relativeEpsilon: 1e-4,
      absoluteFloor: 1e-9,
      experimentName: "vera-vs-baseline-test",
    });

    expect(result.headline).toEqual({
      veraPercent: 100,
      baselinePercent: 50,
    });
    expect(result.baselineMisses).toEqual(["q1"]);
    expect(result.questions[0]).toMatchObject({
      id: "q1",
      expected: 1,
      veraAnswer: 1,
      baselineAnswer: 2,
      veraScore: 1,
      baselineScore: 0,
    });
  });
});
