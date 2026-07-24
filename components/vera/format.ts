/** Display helpers. None of these compute an answer — they only format one. */

/** "0.4s" / "1m 04s". Always tabular-safe: fixed decimal count under a minute. */
export function formatDuration(ms: number): string {
  const safe = Math.max(ms, 0);
  if (safe < 60_000) return `${(safe / 1000).toFixed(1)}s`;
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Group digits without inventing precision. Strings pass through untouched. */
export function formatValue(value: number | string): string {
  if (typeof value === "string") return value;
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Right-align a cell only when it really holds a number. */
export function looksNumeric(value: string): boolean {
  return /^-?[$€£]?\s?[\d,]+(\.\d+)?%?$/.test(value.trim());
}
