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

/**
 * Whether Braintrust spans may carry the raw prompt and completion.
 *
 * Defaults to FALSE, and the default is the point. The codegen prompt embeds
 * the dataset profile and up to five sample rows of the user's file, so logging
 * `input` verbatim ships their data to a third party as a side effect of
 * tracing being on. Traces stay useful without it: model, token counts,
 * latency, finish reason and payload sizes are all still recorded.
 *
 * This flag is necessary but NOT sufficient. It is process-wide, so on its own
 * it would mean that switching tracing on to debug the benchmark also exported
 * whatever a user uploaded next. A request is traced only when this is set AND
 * the caller passes `tracePayloads: true` on that specific request, which only
 * the benchmark does — its data is our own committed CSV. The product's own
 * paths never ask, so no value of this variable can leak a user's file.
 */
export const TRACE_PAYLOADS = process.env.VERA_TRACE_PAYLOADS === "1";

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
  /**
   * Narration gets its own budget. It costs one call per narrated slide (the
   * slide's beats are synthesised in a single request — before that batching,
   * the 2026-07-26 live run served 3 questions with 26 per-beat calls and hit
   * a 429 mid sentence). Sharing one bucket meant a talkative deck could
   * starve the analysis it was narrating. Still capped: this is decks per
   * minute, not an open tap, and each call is short.
   */
  narrationRateLimit: { requests: 60, windowMs: 60_000 },
  /**
   * How many independently grounded findings one deck may carry (phase 11 P3).
   *
   * THE MONEY RULE, expressed as a number: cost is LINEAR in findings — every
   * finding is its own codegen + sandbox run — and the builder has NOT signed
   * off on spend per deck. So this is 1, and with 1 the pipeline is exactly
   * what it was: one question, one finding, one deck. The builder turns it up
   * here, deliberately, when he decides to pay for it. It is a ceiling, not a
   * target: a deck with fewer verified findings simply ends earlier.
   */
  maxFindingsPerDeck: 1,
  /** Absolute cap on paid runs per server process. */
  maxPaidRunsPerProcess: 50,
  maxQuestionLength: 500,
  maxCsvBytes: 5_000_000,
} as const;

export const DEMO_CSV_FILENAME = "demo-business.csv";
