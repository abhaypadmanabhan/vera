import { LIMITS } from "./config";

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

/**
 * Which budget a request draws from.
 *
 * "analysis" is the money guard proper — Fireworks plus a sandbox run per
 * request. "narration" is one call per narrated slide (a whole slide's beats
 * are synthesised in a single request), so a single deck spends several; kept
 * separate so a talkative deck can never starve the analysis it is narrating.
 */
export type RateLimitBucket = "analysis" | "narration";

const BUDGETS: Record<RateLimitBucket, { requests: number; windowMs: number }> = {
  analysis: LIMITS.rateLimit,
  narration: LIMITS.narrationRateLimit,
};

const windows = new Map<string, RateLimitWindow>();

export function checkRateLimit(
  ip: string,
  now = Date.now(),
  bucket: RateLimitBucket = "analysis",
): RateLimitResult {
  const budget = BUDGETS[bucket];
  const key = `${bucket}:${ip}`;
  const current = windows.get(key);

  if (!current || now >= current.resetAt) {
    windows.set(key, {
      count: 1,
      resetAt: now + budget.windowMs,
    });
    return {
      allowed: true,
      remaining: budget.requests - 1,
    };
  }

  if (current.count >= budget.requests) {
    return {
      allowed: false,
      retryAfterMs: current.resetAt - now,
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: budget.requests - current.count,
  };
}
