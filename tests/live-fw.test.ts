import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profileDataset } from "@/lib/profile/profiler";
import { parseCsv } from "@/lib/csv";
import { generatePandasCode } from "@/lib/codegen/generate";

/**
 * LIVE — spends Fireworks credits. Skipped unless VERA_LIVE=1 so a normal
 * `pnpm test` can never cost money.
 *   set -a; . ./.env.local; set +a; VERA_LIVE=1 VERA_MOCK=0 pnpm vitest run tests/live-fw.test.ts
 */
const live = process.env.VERA_LIVE === "1";

describe.skipIf(!live)("LIVE fireworks codegen", () => {
  it("avoids the poisoned Order Quarter column", async () => {
    const csv = readFileSync("data/superstore.csv", "utf8");
    const profile = profileDataset("superstore", "superstore.csv", csv);
    const rows = parseCsv(csv);
    const out = await generatePandasCode(
      {
        question: "What were total sales in Q3 2018?",
        profile,
        sampleRows: rows.slice(1, 4),
        sandboxPath: "/workspace/data.csv",
      },
      { mockMode: false },
    );
    console.log("=== EXPLANATION ===\n" + out.explanation);
    console.log("=== COLUMNS ===\n" + out.columnsUsed.join(", "));
    console.log("=== CODE ===\n" + out.code);
    expect(out.code).not.toContain("Order Quarter");
    expect(out.code).toContain("%d/%m/%Y");
  }, 120_000);
});
