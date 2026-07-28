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

  /*
   * The 2026-07-26 live run served 3 questions with 26 narration calls and hit a
   * 429 mid sentence, because every route drew on one bucket. Narration must not
   * be able to starve the analysis it is narrating, in either direction.
   */
  it("spends narration from a separate budget", () => {
    const ip = "bucket-test";
    const now = 1_000;

    for (let request = 0; request < LIMITS.rateLimit.requests; request++) {
      expect(checkRateLimit(ip, now, "analysis").allowed).toBe(true);
    }
    expect(checkRateLimit(ip, now, "analysis").allowed).toBe(false);

    // Narration is untouched by an exhausted analysis budget.
    expect(checkRateLimit(ip, now, "narration").allowed).toBe(true);
  });

  it("gives a whole deck's worth of beats room without spending the analysis budget", () => {
    const ip = "deck-test";
    const now = 1_000;

    // A live deck ran 26 narration calls across three questions.
    for (let beat = 0; beat < 26; beat++) {
      expect(checkRateLimit(ip, now, "narration").allowed).toBe(true);
    }

    expect(checkRateLimit(ip, now, "analysis").allowed).toBe(true);
  });

  it("still caps narration so a runaway loop cannot drain credit", () => {
    const ip = "narration-cap-test";
    const now = 1_000;

    for (
      let request = 0;
      request < LIMITS.narrationRateLimit.requests;
      request++
    ) {
      expect(checkRateLimit(ip, now, "narration").allowed).toBe(true);
    }

    expect(checkRateLimit(ip, now, "narration")).toMatchObject({
      allowed: false,
      retryAfterMs: LIMITS.narrationRateLimit.windowMs,
    });
  });
});
