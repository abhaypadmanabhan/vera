"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Speaks one narration beat and reports when the audio finishes.
 *
 * The deck advances on `onEnded`, so the presenter blob and Vera's voice share a
 * single timeline: whatever she is saying is what is highlighted. When there is no
 * audio — mock mode returns 204, or the request fails — `available` goes false and
 * the caller falls back to its timer. The deck must never stall waiting on speech.
 */
export function useNarrationAudio({
  text,
  enabled,
  onEnded,
}: {
  text: string | null;
  enabled: boolean;
  onEnded: () => void;
}): { speaking: boolean; available: boolean } {
  const [speaking, setSpeaking] = useState(false);
  const [available, setAvailable] = useState(true);
  const endedRef = useRef(onEnded);
  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!enabled || !text || !available) return;

    let cancelled = false;
    const controller = new AbortController();
    let url: string | null = null;
    let audio: HTMLAudioElement | null = null;

    void (async () => {
      try {
        const response = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        // 204 = mock mode, deliberately silent. Anything else non-OK: give up on
        // audio for the rest of the run rather than retrying on every beat.
        if (response.status === 204 || !response.ok) {
          if (!cancelled) setAvailable(false);
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;

        url = URL.createObjectURL(blob);
        audio = new Audio(url);
        audio.addEventListener("ended", () => {
          if (!cancelled) {
            setSpeaking(false);
            endedRef.current();
          }
        });
        audio.addEventListener("error", () => {
          if (!cancelled) {
            setSpeaking(false);
            setAvailable(false);
          }
        });
        await audio.play();
        if (!cancelled) setSpeaking(true);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        // Autoplay can be blocked before any interaction; treat it like no audio.
        setAvailable(false);
        setSpeaking(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      if (url) URL.revokeObjectURL(url);
      setSpeaking(false);
    };
  }, [available, enabled, text]);

  return { speaking, available };
}
