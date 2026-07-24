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
