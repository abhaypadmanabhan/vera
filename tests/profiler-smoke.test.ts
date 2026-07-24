import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profileDataset } from "@/lib/profile/profiler";
import { isProven } from "@/lib/types";

describe("profiler on the real superstore CSV", () => {
  const csv = readFileSync("data/superstore.csv", "utf8");
  const profile = profileDataset("superstore", "superstore.csv", csv);

  it("proves OrderDate is day-first from the data", () => {
    const col = profile.columns.find((c) => c.name === "OrderDate");
    expect(col?.kind).toBe("date");
    expect(col?.dateFormat).toBe("%d/%m/%Y");
    expect(col?.evidence?.supportingRows).toBe(5952);
    expect(col?.evidence?.contradictingRows).toBe(0);
    console.log("EVIDENCE:", JSON.stringify(col?.evidence, null, 2));
  });

  it("counts rows and duplicates", () => {
    expect(profile.rowCount).toBe(9994);
    expect(profile.duplicateRowCount).toBe(1);
    console.log("NOTES:", profile.notes);
    console.log("KINDS:", profile.columns.map((c) => `${c.name}=${c.kind}`).join(" "));
  });
});

describe("isProven guards the ambiguous case", () => {
  const ambiguous = [
    "Date",
    "01/02/2019",
    "03/04/2019",
    "05/06/2019",
  ].join("\n");

  it("refuses to pick a date order when every value reads both ways", () => {
    const profile = profileDataset("amb", "amb.csv", ambiguous);
    const col = profile.columns[0];
    expect(col?.dateFormat).toBeNull();
    expect(col?.evidence).not.toBeNull();
    // The trap: contradictingRows alone is 0 here, so a naive check would call it proven.
    expect(col?.evidence?.contradictingRows).toBe(0);
    expect(isProven(col!.evidence!)).toBe(false);
  });

  it("calls a genuinely proven claim proven", () => {
    const dayFirst = ["Date", "15/04/2019", "22/11/2017", "01/02/2019"].join("\n");
    const profile = profileDataset("df", "df.csv", dayFirst);
    const col = profile.columns[0];
    expect(col?.dateFormat).toBe("%d/%m/%Y");
    expect(isProven(col!.evidence!)).toBe(true);
  });
});
