"use client";

import { Mic, MicOff, Square } from "lucide-react";
import { TRANSCRIPTION_LIMITS } from "@/lib/elevenlabs/transcription";
import type { Microphone } from "./use-microphone";

/**
 * The mic, and the one line that speaks for it.
 *
 * Both are pure functions of `useMicrophone`'s state so every state can be rendered and
 * asserted without a browser. The status line deliberately occupies the same slot as the
 * keyboard hint: the mic reports into the sentence that is already there, so nothing on
 * this very calm screen moves when you press it.
 */

const CAP_SECONDS = TRANSCRIPTION_LIMITS.maxClipMs / 1_000;

/** `7000` -> `0:07`. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1_000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The sentence under the box. Null means "nothing to add — show the keyboard hint". */
export function micLine(mic: Microphone): string | null {
  if (!mic.supported) return "This browser can't record audio.";
  if (mic.message) return mic.message;
  if (mic.phase === "requesting") return "Waiting for microphone access";
  if (mic.phase === "recording") {
    return `Listening · ${clock(mic.elapsedMs)} / ${clock(TRANSCRIPTION_LIMITS.maxClipMs)}`;
  }
  if (mic.phase === "transcribing") return "Writing down what you said";
  if (mic.wasMock) return "Mock transcript — no audio left this machine";
  return null;
}

export const MIC_STATUS_ID = "vera-mic-status";

/**
 * One line, always present, always in the same place. It is the live region, so a screen
 * reader hears every state change without any duplicate off-screen copy of the same text.
 */
export function MicStatus({ mic, idleHint }: { mic: Microphone; idleHint: string }) {
  const line = micLine(mic);
  return (
    <span
      id={MIC_STATUS_ID}
      role="status"
      aria-live="polite"
      className={`text-micro ${line && mic.problem ? "text-ink" : "text-ink-muted"} ${
        mic.phase === "recording" ? "v-nums" : ""
      }`}
    >
      {line ?? idleHint}
    </span>
  );
}

function label(mic: Microphone): string {
  if (!mic.supported) return "Voice input is unavailable in this browser";
  if (mic.phase === "recording") return "Stop recording and transcribe";
  if (mic.phase === "transcribing") return "Transcribing your question";
  if (mic.phase === "requesting") return "Waiting for microphone access";
  return "Ask by voice";
}

export function MicButton({
  mic,
  reducedMotion,
}: {
  mic: Microphone;
  /** When true the recording state is shown by colour and the timer alone. */
  reducedMotion: boolean;
}) {
  const recording = mic.phase === "recording";
  const busy = mic.phase === "transcribing" || mic.phase === "requesting";
  const disabled = !mic.supported || busy;

  const tone = recording
    ? "border-accent bg-accent text-white"
    : disabled
      ? "border-line bg-transparent text-ink-muted"
      : "border-line bg-transparent text-ink-muted hover:border-line-strong hover:text-ink";

  return (
    <button
      type="button"
      onClick={mic.toggle}
      disabled={disabled}
      aria-label={label(mic)}
      aria-pressed={recording}
      aria-describedby={MIC_STATUS_ID}
      title={`Ask by voice · up to ${CAP_SECONDS} seconds`}
      className={`grid size-9 place-items-center rounded-full border transition-[color,border-color,background-color] duration-150 active:scale-95 disabled:cursor-not-allowed ${tone}`}
    >
      {!mic.supported ? (
        <MicOff className="size-4" aria-hidden />
      ) : recording ? (
        <Square
          className={`size-3 fill-current ${reducedMotion ? "" : "v-breathe"}`}
          aria-hidden
        />
      ) : (
        <Mic className={`size-4 ${mic.phase === "transcribing" && !reducedMotion ? "v-breathe" : ""}`} aria-hidden />
      )}
    </button>
  );
}
