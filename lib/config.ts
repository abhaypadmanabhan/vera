/**
 * Runtime config. Server-only values must never be imported from a client component.
 *
 * THE MONEY RULE (CLAUDE.md): mock mode is the default. Real Fireworks / Daytona /
 * Braintrust / ElevenLabs calls happen only when the builder explicitly turns them on.
 */

/**
 * When true, no external SDK is imported and no network call is made.
 * Defaults to TRUE. Set `VERA_MOCK=0` to arm the real, credit-spending path.
 */
export const MOCK_MODE = process.env.VERA_MOCK !== "0";

/** Hard caps so a runaway loop cannot drain hackathon credits. PRD §4.2, §7. */
export const LIMITS = {
  /** Retries after the first attempt. PRD §7 says max 2. */
  maxRetries: 2,
  /** Wall-clock budget for a whole run, across retries. */
  runBudgetMs: 90_000,
  /** Single sandbox execution timeout. */
  executionTimeoutMs: 30_000,
  /** Requests per window per IP on money-spending routes. */
  rateLimit: { requests: 10, windowMs: 60_000 },
  /** Absolute cap on paid runs per server process. */
  maxPaidRunsPerProcess: 50,
  maxQuestionLength: 500,
  maxCsvBytes: 5_000_000,
} as const;

export const DEMO_CSV_FILENAME = "demo-business.csv";
