import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/*
 * tailwind-merge has to be taught this design system's tokens, or it silently
 * deletes half of them.
 *
 * Out of the box it cannot tell `text-small` (a size) from `text-danger` (a
 * colour) — both are `text-*` with a name it does not recognise — so it files
 * them in the same group and keeps only the last one:
 *
 *   twMerge("text-small text-danger")            ->  "text-danger"
 *   twMerge("text-title font-medium text-ink")   ->  "font-medium text-ink"
 *
 * Nothing errors and nothing warns; the element just renders at the browser's
 * default 16px. Every `cn()` call pairing a size with a colour was affected.
 * Registering the token names below puts each one in its right group.
 *
 * KEEP IN SYNC with the `@theme inline` block in `app/globals.css` — a token
 * added there and not here is a token that gets silently dropped again.
 */
const SIZES = ["micro", "small", "body", "lead", "title", "figure"] as const

const COLORS = [
  "bg",
  "surface",
  "sunk",
  "line",
  "line-strong",
  "ink",
  "ink-muted",
  "accent",
  "accent-wash",
  "warn",
  "warn-wash",
  "danger",
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...SIZES] }],
      "text-color": [{ text: [...COLORS] }],
      "bg-color": [{ bg: [...COLORS] }],
      "border-color": [{ border: [...COLORS] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
