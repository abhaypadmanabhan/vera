"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeakResult } from "./narration-player";
import { createNarrationPlayer } from "./narration-player";

/** Beats never contain a NUL, so it cannot collide with a spoken character. */
const SEPARATOR = "\u0000";

/**
 * Speaks a slide's narration beats and reports each beat as it finishes.
 *
 * One `/api/speak` round trip carries the WHOLE slide (it used to be one per
 * beat — 26 calls for 3 questions on 2026-07-26). The response is a single
 * clip plus the exact end time of each beat inside it, so the deck still
 * advances on `onEnded` per beat and the presenter blob and Vera's voice share
 * a single timeline. When there is no audio — mock mode returns 204, or the
 * request fails — `available` goes false and the caller falls back to its
 * timer. The deck must never stall waiting on speech.
 */
export function useNarrationAudio({
  texts,
  enabled,
  onEnded,
}: {
  /** Every beat of the current slide, in order. Null when the slide is silent. */
  texts: string[] | null;
  enabled: boolean;
  onEnded: () => void;
}): { speaking: boolean; available: boolean; stop: () => void } {
  const [speaking, setSpeaking] = useState(false);
  const [available, setAvailable] = useState(true);
  const endedRef = useRef(onEnded);
  const stopRef = useRef<() => void>(() => undefined);
  const stop = useCallback(() => stopRef.current(), []);

  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);

  // The beats array is rebuilt every render; the joined key is stable per
  // slide, so the effect refetches only when the slide changes, never when
  // the active beat does.
  const key = texts && texts.length > 0 ? texts.join(SEPARATOR) : null;

  useEffect(() => {
    if (!enabled || !key || !available) return;
    const lines = key.split(SEPARATOR);

    const player = createNarrationPlayer({
      speak: async (speakTexts, signal) => {
        const response = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: speakTexts }),
          signal,
        });
        // 204 = mock mode, deliberately silent. Anything else non-OK: give up
        // on audio for the rest of the run rather than retrying every slide.
        if (response.status === 204 || !response.ok) return "unavailable";
        return (await response.json()) as SpeakResult;
      },
      createAudio: (url) => new Audio(url),
      bytesToUrl: (bytes, contentType) =>
        URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: contentType })),
      revokeUrl: (url) => URL.revokeObjectURL(url),
      onBeat: () => endedRef.current(),
      onSpeakingChange: setSpeaking,
      onAvailableChange: setAvailable,
    });
    player.play(lines);

    const stopCurrentAudio = () => player.stop();
    stopRef.current = stopCurrentAudio;

    return () => {
      stopCurrentAudio();
      if (stopRef.current === stopCurrentAudio) stopRef.current = () => undefined;
    };
  }, [available, enabled, key]);

  return { speaking, available, stop };
}
