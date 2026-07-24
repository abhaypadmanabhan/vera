import { describe, expect, it } from "vitest";
import { parseResultValue } from "@/lib/daytona/sandbox";

describe("parseResultValue — the contract with generated code", () => {
  it("reads a JSON number", () => {
    expect(parseResultValue("noise\nVERA_RESULT:143787.3622\n")).toBe(143787.3622);
  });
  it("reads a JSON string", () => {
    expect(parseResultValue('VERA_RESULT:"Tables"')).toBe("Tables");
  });
  it("takes the LAST marker when the code prints more than one", () => {
    expect(parseResultValue("VERA_RESULT:1\nVERA_RESULT:2")).toBe(2);
  });
  it("returns null when the marker is absent — no value means no number", () => {
    expect(parseResultValue("143787.36")).toBeNull();
  });
  it("returns null on an empty marker", () => {
    expect(parseResultValue("VERA_RESULT:")).toBeNull();
  });
  it("returns null for NaN/Infinity rather than leaking them as a figure", () => {
    expect(parseResultValue("VERA_RESULT:NaN")).toBeNull();
    expect(parseResultValue("VERA_RESULT:Infinity")).toBeNull();
  });
});

describe("python non-answers must block", () => {
  it.each(["NaN", "nan", "None", "null", "inf", "-Infinity", "N/A"])(
    "%s returns null",
    (token) => {
      expect(parseResultValue(`VERA_RESULT:${token}`)).toBeNull();
    },
  );
});

describe("labelled answers", () => {
  it("unwraps a single-key object — unambiguous", () => {
    expect(parseResultValue('VERA_RESULT:{"total_sales_q3_2018": 143787.3622}')).toBe(143787.3622);
  });
  it("unwraps a single-element array", () => {
    expect(parseResultValue("VERA_RESULT:[42]")).toBe(42);
  });
  it("blocks a multi-key object — which one is the answer?", () => {
    expect(parseResultValue('VERA_RESULT:{"a": 1, "b": 2}')).toBeNull();
  });
  it("blocks a multi-element array", () => {
    expect(parseResultValue("VERA_RESULT:[1,2]")).toBeNull();
  });
  it("still blocks a wrapped NaN", () => {
    expect(parseResultValue('VERA_RESULT:{"x": null}')).toBeNull();
  });
});
