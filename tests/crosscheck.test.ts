import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profileDataset } from "@/lib/profile/profiler";

describe("cross-check on the real superstore file", () => {
  it("catches the poisoned Order Quarter column", () => {
    const p = profileDataset("s", "s.csv", readFileSync("data/superstore.csv", "utf8"));
    p.crossChecks.forEach((c) => console.log("•", c.claim, "\n  ", c.method, "\n  ex:", c.examples[0] ?? "-"));
    console.log("\nNOTES FED TO CODEGEN:");
    p.notes.forEach((n) => console.log(" -", n));
    const bad = p.crossChecks.find((c) => c.claim.includes("Order Quarter") && c.claim.includes("disagrees"));
    expect(bad?.supportingRows).toBe(2889);
  });
});
