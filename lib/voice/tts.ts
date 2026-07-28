import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { MOCK_MODE } from "../config";
import type { Finding } from "../types";

/**
 * SERVER ONLY. Vera's voice (PRD §4.6).
 *
 * THE RULE THAT MATTERS: only a `verified` finding is ever spoken. That is
 * enforced by the type system here — `speechFor` takes the verified branch of
 * the union, so there is no way to pass it an unverified finding. Do not add an
 * overload that accepts `Finding`.
 *
 * Nothing runs at import time and `MOCK_MODE` hard-blocks the call, so the
 * mocked build can never reach ElevenLabs.
 */

type VerifiedFinding = Extract<Finding, { verdict: "verified" }>;

/** Rachel — a calm, analyst-sounding default. Override with ELEVENLABS_VOICE_ID. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const MODEL_ID = "eleven_turbo_v2_5";

let cached: ElevenLabsClient | null = null;

function client(): ElevenLabsClient {
  if (MOCK_MODE) {
    throw new Error(
      "ElevenLabs was called while MOCK_MODE is on. This is a bug — mock mode must never speak.",
    );
  }
  if (cached) return cached;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set.");
  cached = new ElevenLabsClient({ apiKey });
  return cached;
}

/**
 * The line Vera says. Kept short — a spoken sentence, not the claim verbatim,
 * and it never asserts more than PRD §6 allows.
 */
export function speechFor(finding: VerifiedFinding): string {
  const figure =
    typeof finding.value === "number"
      ? finding.value.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : finding.value;
  const unit = finding.unit ?? "";
  const columns = finding.grounding.columns.join(" and ");
  return `${figure}${unit}. ${finding.claim} I computed that from ${columns}, across ${finding.grounding.rowCount.toLocaleString()} rows of your file.`;
}

export interface SpokenFinding {
  audio: Uint8Array;
  contentType: string;
  text: string;
}

export interface SpokenBeats {
  audio: Uint8Array;
  contentType: string;
  /**
   * End time of each beat, in seconds, in the single synthesised clip — one
   * entry per beat, the last being the clip's duration. Null when the voice
   * service returned no alignment; the player then estimates boundaries
   * proportionally from the audio duration.
   */
  beatEndsSeconds: number[] | null;
  text: string;
}

export interface CharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

/**
 * Map beat boundaries onto the timeline of one clip synthesised from
 * `texts.join(" ")`. Exact: each beat's end is the end time of its last
 * character in the alignment the voice service returned.
 *
 * Returns null when the alignment does not describe the joined text exactly —
 * a silently wrong boundary is worse than an estimated one, so any mismatch
 * falls back to the player's proportional estimate rather than a guess.
 */
export function beatEndsFromAlignment(
  texts: string[],
  alignment: CharacterAlignment | null | undefined,
): number[] | null {
  if (!alignment) return null;
  const joined = texts.join(" ");
  const { characters, characterEndTimesSeconds } = alignment;
  if (characters.length !== joined.length || characterEndTimesSeconds.length !== joined.length) {
    return null;
  }
  const ends: number[] = [];
  let offset = 0;
  let previous = 0;
  for (let beat = 0; beat < texts.length; beat++) {
    offset += texts[beat].length;
    for (let i = offset - texts[beat].length; i < offset; i++) {
      if (characters[i] !== joined[i]) return null;
    }
    const end = characterEndTimesSeconds[offset - 1] ?? 0;
    if (end < previous) return null;
    ends.push(end);
    previous = end;
    offset += 1; // the space joining this beat to the next
  }
  return ends;
}

/**
 * Speak one line. Used for a narration beat from the deck.
 *
 * The deck only produces beats for a VERIFIED finding (`buildDeck` returns zero
 * slides otherwise), so an unproven number can never reach this function.
 */
export async function speakLine(
  text: string,
  signal?: AbortSignal,
): Promise<SpokenFinding> {
  return convert(text, signal);
}

/**
 * Speak a whole slide's beats in ONE ElevenLabs round trip.
 *
 * Cost used to scale with how talkative a deck is — one call per beat, 26 calls
 * for 3 questions on 2026-07-26. Now it scales with slides: the beats are
 * joined with a space (which synthesises as a natural pause) and synthesised
 * once, and the returned character alignment gives the exact second each beat
 * ends, so the UI focus still walks beat by beat over a single clip.
 */
export async function speakBeats(
  texts: string[],
  signal?: AbortSignal,
): Promise<SpokenBeats> {
  const text = texts.join(" ");
  const response = await client().textToSpeech.convertWithTimestamps(
    process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID,
    {
      text,
      modelId: MODEL_ID,
      outputFormat: "mp3_44100_128",
    },
    { abortSignal: signal },
  );

  const audio = new Uint8Array(Buffer.from(response.audioBase64, "base64"));
  return {
    audio,
    contentType: "audio/mpeg",
    beatEndsSeconds: beatEndsFromAlignment(texts, response.alignment),
    text,
  };
}

/** Convert a verified finding to speech. Spends ElevenLabs credits. */
export async function speakFinding(
  finding: VerifiedFinding,
  signal?: AbortSignal,
): Promise<SpokenFinding> {
  return convert(speechFor(finding), signal);
}

async function convert(text: string, signal?: AbortSignal): Promise<SpokenFinding> {
  const stream = await client().textToSpeech.convert(
    process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID,
    {
      text,
      modelId: MODEL_ID,
      outputFormat: "mp3_44100_128",
    },
    { abortSignal: signal },
  );

  // The SDK returns a web ReadableStream, which is not async-iterable in this
  // TS lib target — read it with a reader rather than a for-await.
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const audio = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.length;
  }

  return { audio, contentType: "audio/mpeg", text };
}
