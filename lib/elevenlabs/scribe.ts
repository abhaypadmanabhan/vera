import { ElevenLabsClient, ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { MOCK_MODE } from "../config";
import { AUDIO_EXTENSIONS, baseAudioType } from "./transcription";

/**
 * SERVER ONLY. Speech to text via ElevenLabs Scribe — the other direction from
 * `lib/voice/tts.ts`.
 *
 * Nothing runs at import time and `isMockTranscription()` hard-blocks the call, so a
 * keyless machine can never reach ElevenLabs. Spends credits when it does run.
 */

/**
 * Scribe v1 is the GA model on every account; `ELEVENLABS_SCRIBE_MODEL=scribe_v2` opts
 * into the newer one where it is enabled.
 */
const DEFAULT_MODEL_ID: ElevenLabs.SpeechToTextConvertRequestModelId = "scribe_v1";

/** Only the two ids the SDK knows are accepted; anything else falls back to the default. */
function modelId(): ElevenLabs.SpeechToTextConvertRequestModelId {
  const requested = process.env.ELEVENLABS_SCRIBE_MODEL;
  return requested === "scribe_v2" || requested === "scribe_v1"
    ? requested
    : DEFAULT_MODEL_ID;
}

let cached: ElevenLabsClient | null = null;

/**
 * True when this request must not cost anything: mock mode is on, or there is no key to
 * spend. Both cases return the canned transcript rather than failing — CLAUDE.md requires
 * the whole app to run with zero keys.
 */
export function isMockTranscription(): boolean {
  return MOCK_MODE || !process.env.ELEVENLABS_API_KEY;
}

function client(): ElevenLabsClient {
  if (isMockTranscription()) {
    throw new Error(
      "ElevenLabs Scribe was called with no key or with MOCK_MODE on. This is a bug — mock mode must never transcribe.",
    );
  }
  cached ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  return cached;
}

export interface Transcript {
  /** The words. Empty string when the clip held no speech — the caller decides what to say. */
  text: string;
  /** ISO-639-3 code Scribe detected, or null when the response did not carry one. */
  languageCode: string | null;
}

/**
 * Transcribe one recorded clip. The caller has already enforced the size and duration
 * caps; this function only talks to ElevenLabs.
 */
export async function transcribeClip(
  audio: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
): Promise<Transcript> {
  const base = baseAudioType(contentType);
  const extension = AUDIO_EXTENSIONS[base] ?? "webm";

  const response = await client().speechToText.convert(
    {
      modelId: modelId(),
      file: {
        // `Uint8Array` is a `FileLike`; the filename is what Scribe sniffs the
        // container from, so it has to match the recorder's mime type.
        data: audio,
        filename: `question.${extension}`,
        contentType: base,
        contentLength: audio.byteLength,
      },
      // A spoken question is one speaker and no laughter cues. Both defaults would
      // otherwise put "(laughter)"-style tags into the question box.
      tagAudioEvents: false,
      diarize: false,
    },
    { abortSignal: signal },
  );

  // `convert` returns a union: a single transcript, a per-channel bundle, or a webhook
  // ack. We ask for none of the modes that produce the other two, so the single
  // transcript is the only shape we can get — but narrow rather than cast.
  if (!("text" in response) || typeof response.text !== "string") {
    throw new Error("ElevenLabs returned no transcript for that clip.");
  }

  return {
    text: response.text.trim(),
    languageCode: "languageCode" in response ? response.languageCode : null,
  };
}
