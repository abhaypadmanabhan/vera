import { LIMITS } from "./config";

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

const windows = new Map<string, RateLimitWindow>();

export function checkRateLimit(
  ip: string,
  now = Date.now(),
): RateLimitResult {
  const current = windows.get(ip);

  if (!current || now >= current.resetAt) {
    windows.set(ip, {
      count: 1,
      resetAt: now + LIMITS.rateLimit.windowMs,
    });
    return {
      allowed: true,
      remaining: LIMITS.rateLimit.requests - 1,
    };
  }

  if (current.count >= LIMITS.rateLimit.requests) {
    return {
      allowed: false,
      retryAfterMs: current.resetAt - now,
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: LIMITS.rateLimit.requests - current.count,
  };
}
