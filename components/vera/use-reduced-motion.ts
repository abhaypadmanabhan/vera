"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSnapshot = (): boolean => window.matchMedia(QUERY).matches;

/** Nothing animates on the server, so the first paint assumes no motion is fine. */
const getServerSnapshot = (): boolean => false;

/** True when the reader has asked for no animation. Charts read it before animating. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
