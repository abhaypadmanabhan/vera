import { describe, expect, it } from "vitest";
import { Daytona } from "@daytona/sdk";

/**
 * Deletes one sandbox by exact id. Pass VERA_SANDBOX_ID.
 * Used to clean up after a live session so nothing keeps burning credits.
 *   set -a; . ./.env.local; set +a; VERA_LIVE=1 VERA_SANDBOX_ID=<id> pnpm vitest run tests/reap.live.test.ts
 */
const id = process.env.VERA_SANDBOX_ID;

describe.skipIf(process.env.VERA_LIVE !== "1" || !id)("sandbox cleanup", () => {
  it("deletes the sandbox this session created", async () => {
    const d = new Daytona({ apiKey: process.env.DAYTONA_API_KEY! });
    const sandbox = await d.get(id!);
    console.log("deleting", sandbox.id, sandbox.state ?? "?");
    await sandbox.delete(60);
    console.log("deleted", id);
    expect(true).toBe(true);
  }, 180_000);
});
