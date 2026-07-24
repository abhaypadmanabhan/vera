"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

/**
 * The theme lives on `<html data-theme>`, not in React — an inline script stamps
 * it before first paint so a dark-mode reader never sees a white flash. This
 * store just reads it back, and re-reads when the OS preference changes.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    query.removeEventListener("change", onChange);
  };
}

function getSnapshot(): Theme {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === "dark" || stamped === "light") return stamped;
  // Light is Vera's default (DESIGN.md v3), not the OS preference.
  return "light";
}

const getServerSnapshot = (): Theme => "light";

/**
 * Charts have to read the same in both modes, so both modes are real and both
 * are reachable. Swaps token values on the root; no component knows about it.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("vera-theme", next);
    } catch {
      // A blocked localStorage costs the preference, not the toggle.
    }
    listeners.forEach((notify) => notify());
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="grid size-8 place-items-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-sunk hover:text-ink"
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
