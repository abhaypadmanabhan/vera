/*
 * THE MONEY RULE, enforced before a single test runs (CLAUDE.md).
 *
 * Several helpers fall back to the ambient `MOCK_MODE` when the caller does not
 * pass one — `generatePandasCode`, `generatePrep`, the analyst. With
 * `VERA_MOCK=0` left in the shell after a live session AND `.env.local` sourced,
 * `pnpm test` would make real, billable Fireworks and Daytona calls. Today it
 * happens to fail earlier on a missing key, which is luck, not a guarantee.
 *
 * This does NOT set `VERA_MOCK`. Mock mode is the default when the variable is
 * absent, and `tests/speak-route-mock.test.ts` asserts exactly that — the
 * product must run with zero configuration and zero keys. Writing a value here
 * would defeat the guarantee it is checking. So instead of making the unsafe
 * configuration safe, this refuses to run in it.
 *
 * The live suites are the one legitimate exception; they are gated on
 * `VERA_LIVE=1` and are invoked deliberately:
 *
 *   set -a; . ./.env.local; set +a
 *   VERA_LIVE=1 VERA_MOCK=0 pnpm vitest run tests/live-e2e.test.ts
 */
if (process.env.VERA_MOCK === "0" && process.env.VERA_LIVE !== "1") {
  throw new Error(
    "Refusing to run the test suite with VERA_MOCK=0 and VERA_LIVE unset: " +
      "any helper that falls back to ambient mock mode would make a real, " +
      "billable API call. Unset VERA_MOCK, or set VERA_LIVE=1 if you genuinely " +
      "mean to run the gated live tests and spend credits.",
  );
}
