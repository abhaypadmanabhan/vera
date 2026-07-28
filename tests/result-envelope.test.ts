import { describe, expect, it } from "vitest";
import { parseResultPayload, parseResultValue } from "@/lib/daytona/sandbox";

describe("parseResultPayload — the widened contract with generated code", () => {
  it("still reads a bare scalar, exactly as before", () => {
    expect(parseResultPayload("VERA_RESULT:143787.36")).toEqual({
      value: 143787.36,
      contextValues: {},
    });
  });

  it("reads the envelope form", () => {
    const line =
      'VERA_RESULT:{"value":143787.36,"context":{"prior_period":121004.2,"share_of_total":0.42}}';
    expect(parseResultPayload(line)).toEqual({
      value: 143787.36,
      contextValues: { prior_period: 121004.2, share_of_total: 0.42 },
    });
  });

  it("drops a context entry that is not a usable figure — she says less, never wrong", () => {
    const line =
      'VERA_RESULT:{"value":10,"context":{"good":5,"bad":null,"worse":"","awful":[1,2]}}';
    expect(parseResultPayload(line).contextValues).toEqual({ good: 5 });
  });

  it("drops NaN and Infinity from context, as it already does for the primary value", () => {
    const line = 'VERA_RESULT:{"value":10,"context":{"a":"NaN","b":"Infinity"}}';
    expect(parseResultPayload(line).contextValues).toEqual({});
  });

  it("keeps at most three context figures", () => {
    const line = 'VERA_RESULT:{"value":1,"context":{"a":1,"b":2,"c":3,"d":4}}';
    expect(Object.keys(parseResultPayload(line).contextValues)).toHaveLength(3);
  });

  it("a malformed envelope blocks the value rather than half-reading it", () => {
    expect(parseResultPayload('VERA_RESULT:{"context":{"a":1}}').value).toBeNull();
  });

  it("leaves parseResultValue behaving exactly as it did", () => {
    expect(parseResultValue("VERA_RESULT:143787.36")).toBe(143787.36);
    expect(parseResultValue('VERA_RESULT:{"value":10,"context":{"a":1}}')).toBe(10);
  });
});
