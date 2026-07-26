/**
 * Plays one slide's narration as a SINGLE synthesised clip and walks the deck's
 * beats along the clip's timeline.
 *
 * This module is deliberately framework-free: every browser seam (fetch, Audio,
 * object URLs) is injected, so the interrupt behaviour — STOP must silence the
 * slide instantly and no beat may ever arrive after it — is proven in unit
 * tests rather than argued. The React hook in `use-narration-audio.ts` is a
 * thin wrapper that supplies the real browser seams.
 *
 * THE INVARIANT THAT MATTERS: after `stop()`, nothing async may ever call
 * `onBeat` or produce sound again. One request carries the whole slide, so
 * aborting it means no later beat can arrive; every continuation is guarded by
 * a generation counter so a fetch that resolves after STOP (or after the deck
 * moved to the next slide) is dropped, never played.
 */

export interface SpeakResult {
  /** Base64-encoded audio for the whole slide. */
  audio: string;
  contentType: string;
  /** Exact end time of each beat, from the voice service's alignment. */
  beatEndsSeconds: number[] | null;
}

/** The slice of HTMLAudioElement the player needs. */
export interface NarrationAudio {
  currentTime: number;
  readonly duration: number;
  src: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface NarrationPlayerDeps {
  /** One round trip for the whole slide. "unavailable" = 204 mock / failure. */
  speak: (texts: string[], signal: AbortSignal) => Promise<SpeakResult | "unavailable">;
  createAudio: (url: string) => NarrationAudio;
  bytesToUrl: (bytes: Uint8Array, contentType: string) => string;
  revokeUrl: (url: string) => void;
  /** Fires once per beat, in order, as the clip passes each beat's end. */
  onBeat: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  onAvailableChange: (available: boolean) => void;
}

export interface NarrationPlayer {
  play: (texts: string[]) => void;
  stop: () => void;
}

/**
 * Estimated beat boundaries when the voice service returned no alignment:
 * each beat claims a share of the clip proportional to its length. The words
 * are unchanged either way — only the focus timing is approximate here.
 */
export function proportionalBeatEnds(texts: string[], durationSeconds: number): number[] {
  const weights = texts.map((text) => Math.max(text.length, 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;
  return weights.map((weight) => {
    elapsed += weight;
    return (elapsed / total) * durationSeconds;
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function createNarrationPlayer(deps: NarrationPlayerDeps): NarrationPlayer {
  // Incremented by both play() and stop(); any async continuation holding an
  // older generation has been superseded or silenced and must do nothing.
  let generation = 0;
  let controller: AbortController | null = null;
  let audio: NarrationAudio | null = null;
  let url: string | null = null;
  let nextBeat = 0;

  function stop(): void {
    generation++;
    controller?.abort();
    controller = null;
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    if (url) {
      deps.revokeUrl(url);
      url = null;
    }
    deps.onSpeakingChange(false);
  }

  function play(texts: string[]): void {
    if (texts.length === 0) return;
    const gen = ++generation;
    nextBeat = 0;
    controller = new AbortController();
    void run(texts, controller.signal, gen);
  }

  async function run(texts: string[], signal: AbortSignal, gen: number): Promise<void> {
    const stale = () => gen !== generation;

    let result: SpeakResult | "unavailable";
    try {
      result = await deps.speak(texts, signal);
    } catch (error) {
      // Aborted by stop() — silence, exactly as asked. Anything else: give up
      // on audio for the rest of the run rather than failing every slide.
      if (stale() || (error instanceof DOMException && error.name === "AbortError")) return;
      deps.onAvailableChange(false);
      deps.onSpeakingChange(false);
      return;
    }
    // The fetch resolved after STOP. Nothing may play and no beat may fire.
    if (stale()) return;

    if (result === "unavailable") {
      deps.onAvailableChange(false);
      return;
    }

    url = deps.bytesToUrl(base64ToBytes(result.audio), result.contentType);
    const clip = deps.createAudio(url);
    audio = clip;

    const ends = (): number[] | null => {
      if (result.beatEndsSeconds && result.beatEndsSeconds.length === texts.length) {
        return result.beatEndsSeconds;
      }
      if (!Number.isFinite(clip.duration) || clip.duration <= 0) return null;
      return proportionalBeatEnds(texts, clip.duration);
    };

    const onTime = () => {
      if (stale()) return;
      const boundaries = ends();
      if (!boundaries) return;
      // Every beat but the last advances here; the last belongs to "ended".
      while (nextBeat < boundaries.length - 1 && clip.currentTime >= boundaries[nextBeat]) {
        nextBeat++;
        deps.onBeat();
      }
    };

    const onEnded = () => {
      if (stale()) return;
      deps.onSpeakingChange(false);
      // Fire whatever timeupdate missed (it ticks ~4Hz), then the last beat.
      while (nextBeat < texts.length) {
        nextBeat++;
        deps.onBeat();
      }
    };

    const onError = () => {
      if (stale()) return;
      deps.onSpeakingChange(false);
      deps.onAvailableChange(false);
    };

    clip.addEventListener("timeupdate", onTime);
    clip.addEventListener("ended", onEnded);
    clip.addEventListener("error", onError);

    try {
      await clip.play();
    } catch {
      // Autoplay can be blocked before any interaction; treat it like no audio.
      if (!stale()) {
        deps.onAvailableChange(false);
        deps.onSpeakingChange(false);
      }
      return;
    }
    if (!stale()) deps.onSpeakingChange(true);
  }

  return { play, stop };
}
