/**
 * The mic's contract, with zero dependencies.
 *
 * This file is imported by BOTH the browser component and the server route, so it must
 * never import the ElevenLabs SDK (that would ship the SDK — and an easy path to leaking
 * the key — into the client bundle). The SDK lives in `./scribe.ts`, which is server-only.
 */

/**
 * Hard caps on a clip. PRD §7 / CLAUDE.md "THE MONEY RULE": a money-spending route gets a
 * ceiling before it ships.
 *
 * `maxAudioBytes` is the cap the server actually enforces, because bytes are the only
 * thing it can measure without decoding the audio. It is also a duration proxy:
 * MediaRecorder's Opus stream runs ~32-48 kbps, so 30s of speech is ~200 KB — 2 MB is a
 * generous ceiling that still refuses a runaway upload.
 *
 * `maxClipMs` is enforced twice, and only one of those is trustworthy: the browser
 * auto-stops the recorder at the cap (real), and the route rejects a *declared* duration
 * over it (advisory — a caller can lie, which is why the byte cap is the real guard).
 */
export const TRANSCRIPTION_LIMITS = {
  maxAudioBytes: 2_000_000,
  /** Below this a clip is a click or a dropped connection, not speech. */
  minAudioBytes: 1_200,
  maxClipMs: 30_000,
} as const;

/**
 * Container types MediaRecorder actually emits across Chrome, Firefox and Safari.
 * Compared against the blob's base type, with `;codecs=...` stripped.
 */
export const ACCEPTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
] as const;

/** The filename handed to ElevenLabs — it sniffs the container from the extension. */
export const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** `audio/webm;codecs=opus` -> `audio/webm`. */
export function baseAudioType(contentType: string): string {
  return contentType.split(";")[0]!.trim().toLowerCase();
}

export function isAcceptedAudioType(contentType: string): boolean {
  return (ACCEPTED_AUDIO_TYPES as readonly string[]).includes(
    baseAudioType(contentType),
  );
}

/**
 * What mock mode says when asked to transcribe.
 *
 * The text is a real, runnable question so the keyless demo still flows end to end, but
 * the response carries `mock: true` and the UI prints an unmissable line saying no audio
 * left the machine. Per CLAUDE.md's honesty rule, we never let a mock look live.
 */
export const MOCK_TRANSCRIPT = "What were total sales in Q3 2018?";

/** 200 response body of `POST /api/transcribe`. */
export interface TranscriptPayload {
  text: string;
  /** True when nothing was sent to ElevenLabs and `text` is canned. */
  mock: boolean;
}

/** Everything that can go wrong between pressing the mic and reading the words. */
export type MicProblem =
  | "unsupported"
  | "no-device"
  | "denied"
  | "in-use"
  | "no-speech"
  | "too-long"
  | "rate-limited"
  | "failed";

/** Plain English, and every one of them tells the user what to do next. */
export const MIC_MESSAGES: Readonly<Record<MicProblem, string>> = {
  unsupported: "This browser can't record audio. Type your question instead.",
  "no-device": "No microphone found. Plug one in, or type your question instead.",
  denied:
    "Microphone access is blocked. Allow it in your browser's site settings, then press the mic again.",
  "in-use": "Another app is using the microphone. Close it, then press the mic again.",
  "no-speech": "I didn't catch any words. Press the mic and speak a little closer.",
  "too-long": `That clip ran past ${TRANSCRIPTION_LIMITS.maxClipMs / 1_000} seconds. Ask it in a shorter sentence.`,
  "rate-limited": "Too many voice requests just now. Wait a moment, then press the mic again.",
  failed: "Transcription failed. Type your question instead.",
};
