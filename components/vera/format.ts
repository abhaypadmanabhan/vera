/** Display helpers. None of these compute an answer — they only format one. */

/** "0.4s" / "1m 04s". Always tabular-safe: fixed decimal count under a minute. */
export function formatDuration(ms: number): string {
  const safe = Math.max(ms, 0);
  if (safe < 60_000) return `${(safe / 1000).toFixed(1)}s`;
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * Group digits for display. Strings pass through untouched.
 *
 * Two decimals, matching what the voice says (`lib/deck.ts`) — a headline reading
 * 143,787.3622 while Vera says "143,787.36" looks like two different answers. The
 * exact value is never lost: it is in the execution result and in the stdout line
 * shown on the code slide.
 */
export function formatValue(value: number | string): string {
  if (typeof value === "string") return value;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * The figure as it is set at 88px: sign, then unit, then digits — `-$17,725.48`.
 * Never invents precision; the sign stays in front of the unit so a loss reads as
 * a loss at a glance.
 */
export function formatFigure(value: number | string, unit: string | null): string {
  const digits = formatValue(value);
  if (!unit) return digits;
  if (unit === "%") return `${digits}%`;
  if (unit.length <= 2 && /^[^\w\s]+$/.test(unit)) {
    return digits.startsWith("-") ? `-${unit}${digits.slice(1)}` : `${unit}${digits}`;
  }
  return `${digits} ${unit}`;
}

/** Whole counts, grouped. Used for row counts, supporting/contradicting rows. */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

/** "2.3 MB" — the size of the file on record, never guessed. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Right-align a cell only when it really holds a number. */
export function looksNumeric(value: string): boolean {
  return /^-?[$€£]?\s?[\d,]+(\.\d+)?%?$/.test(value.trim());
}
