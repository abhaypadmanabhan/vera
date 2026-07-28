import { MOCK_MODE } from "./config";
import { createGuardedAnalyst } from "./analyst/guarded";
import { mockAnalyst } from "./mock/engine";
import type { Analyst } from "./types";

/**
 * THE SWAP POINT.
 *
 * Phase 1 runs entirely on `mockAnalyst` — zero external calls, zero keys.
 * When Phases 2-4 land, the real orchestrator (Fireworks + Daytona + the
 * safeguard) is imported here and this becomes:
 *
 *   return MOCK_MODE ? mockAnalyst : realAnalyst;
 *
 * That is the ONLY line that changes. Nothing else in the app knows which one
 * it is talking to. Keep the real import lazy so mock mode never pulls a paid
 * SDK into the process (CLAUDE.md money rule).
 */
export function getAnalyst(): Analyst {
  if (MOCK_MODE) return createGuardedAnalyst(mockAnalyst);
  // Lazy require so mock mode never pulls a paid SDK into the process.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { realAnalyst } = require("./real-analyst") as typeof import("./real-analyst");
  return createGuardedAnalyst(realAnalyst);
}
