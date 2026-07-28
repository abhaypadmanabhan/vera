import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses quoted fields and embedded commas", () => {
    expect(parseCsv('name,amount\n"Acme, Inc.","$12,400"')).toEqual([
      ["name", "amount"],
      ["Acme, Inc.", "$12,400"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("name,amount\r\nAcme,10\r\nBeta,20\r\n")).toEqual([
      ["name", "amount"],
      ["Acme", "10"],
      ["Beta", "20"],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("name,amount\n\nAcme,10\n  , \nBeta,20")).toEqual([
      ["name", "amount"],
      ["Acme", "10"],
      ["Beta", "20"],
    ]);
  });
});
