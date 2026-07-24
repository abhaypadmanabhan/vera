import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  it("blocks an IP after the configured requests and resets after the window", () => {
    const ip = "rate-limit-test";
    const now = 1_000;

    for (let request = 0; request < LIMITS.rateLimit.requests; request++) {
      expect(checkRateLimit(ip, now).allowed).toBe(true);
    }

    expect(checkRateLimit(ip, now)).toMatchObject({
      allowed: false,
      retryAfterMs: LIMITS.rateLimit.windowMs,
    });
    expect(checkRateLimit(ip, now + LIMITS.rateLimit.windowMs).allowed).toBe(true);
  });
});
