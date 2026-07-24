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
