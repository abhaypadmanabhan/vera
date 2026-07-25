import { describe, expect, it } from "vitest";
import { speechFor } from "@/lib/voice/tts";
import type { Finding } from "@/lib/types";

const verified: Extract<Finding, { verdict: "verified" }> = {
  verdict: "verified",
  value: 143787.36,
  unit: null,
  claim: "Total sales in Q3 2018 were $143,787.36.",
  code: { language: "python", source: "print(1)", explanation: "x", lineCount: 1 },
  execution: {
    exitCode: 0,
    stdout: "",
    stderr: "",
    value: 143787.36,
    contextValues: {},
    durationMs: 1,
  },
  grounding: {
    columns: ["OrderDate", "Sales"],
    rowCount: 9994,
    rowRange: [0, 9993],
    sampleCells: [],
    schemaEvidence: [],
  },
  attempts: 1,
};

describe("Vera's voice", () => {
  it("speaks the figure, the claim and where it came from", () => {
    const line = speechFor(verified);
    expect(line).toContain("143,787.36");
    expect(line).toContain("OrderDate and Sales");
    expect(line).toContain("9,994");
  });

  it("only accepts a verified finding — the unverified branch is a type error", () => {
    const unverified = {
      verdict: "unverified" as const,
      reason: "null_result" as const,
      detail: "",
      code: null,
      attempts: 2,
    };
    // @ts-expect-error an unverified finding has no `value` and must never be spoken.
    // The compile error IS the assertion; it also throws at runtime, so nothing can
    // slip past by casting.
    expect(() => speechFor(unverified)).toThrow();
  });
});
