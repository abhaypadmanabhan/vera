import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profileDataset } from "@/lib/profile/profiler";

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
