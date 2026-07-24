import { describe, expect, it } from "vitest";
import { resolveDataset } from "@/lib/datasets";
import { realAnalyst } from "@/lib/real-analyst";
import { teardownSandbox } from "@/lib/daytona/sandbox";
import type { Finding, StageEvent } from "@/lib/types";

/**
 * LIVE — spends Fireworks AND Daytona credits. Gated behind VERA_LIVE=1.
 *   set -a; . ./.env.local; set +a; VERA_LIVE=1 VERA_MOCK=0 pnpm vitest run tests/live-e2e.test.ts
 */
const live = process.env.VERA_LIVE === "1";

describe.skipIf(!live)("LIVE end to end: Fireworks -> Daytona -> safeguard", () => {
  it("computes Q3 2018 sales and grounds it in real cells", async () => {
    const dataset = await resolveDataset("superstore");
    const events: StageEvent[] = [];
    let finding: Finding | null = null;

    for await (const event of realAnalyst.run({
      question: "What were total sales in Q3 2018?",
      dataset,
    })) {
      events.push(event);
      if (event.type === "stage") {
        console.log(`[${String(event.elapsedMs).padStart(6)}ms] ${event.stage.padEnd(16)} ${event.status.padEnd(9)} ${event.detail}`);
      }
      if (event.type === "finding") finding = event.finding;
      if (event.type === "error") console.log("ERROR EVENT:", event.message);
    }

    console.log("\n=== FINDING ===");
    console.log(JSON.stringify(finding, null, 2).slice(0, 2400));

    expect(finding).not.toBeNull();
    expect(finding?.verdict).toBe("verified");
    if (finding?.verdict === "verified") {
      expect(Number(finding.value)).toBeCloseTo(143787.36, 1);
      expect(finding.grounding.sampleCells.length).toBeGreaterThan(0);
    }
  }, 300_000);

  it("tears the sandbox down so nothing keeps burning", async () => {
    const id = await teardownSandbox();
    console.log("torn down sandbox:", id);
    expect(id).not.toBeNull();
  }, 120_000);
});
