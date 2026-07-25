import { checkRateLimit } from "@/lib/rate-limit";
import { isMockTranscription, transcribeClip } from "@/lib/elevenlabs/scribe";
import {
  MOCK_TRANSCRIPT,
  TRANSCRIPTION_LIMITS,
  isAcceptedAudioType,
  type TranscriptPayload,
} from "@/lib/elevenlabs/transcription";

export const runtime = "nodejs";

/**
 * The user's voice. Turns one recorded clip into the text of a question.
 *
 * Nothing here submits anything: the words go back to the browser and land in the
 * question box for the user to read and press Enter on. A mis-heard question that
 * silently ran an analysis would be worse than a slow one.
 *
 * Spends ElevenLabs credits, so it is rate limited and size capped before anything else
 * happens, and it returns a labelled canned transcript when there is no key to spend.
 */

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function fail(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

const TOO_BIG = `That recording is over ${Math.round(
  TRANSCRIPTION_LIMITS.maxAudioBytes / 100_000,
) / 10} MB. Ask it in a shorter sentence.`;

export async function POST(request: Request): Promise<Response> {
  const rate = checkRateLimit(clientIp(request));
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many transcription requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil(rate.retryAfterMs / 1_000))),
        },
      },
    );
  }

  // Refuse an oversized upload from the header, before reading a single byte of it.
  // The declared length is a courtesy, not a guarantee — the blob is measured below too.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > TRANSCRIPTION_LIMITS.maxAudioBytes) {
    return fail(413, TOO_BIG);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Body must be multipart/form-data with an `audio` file.");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return fail(400, "No audio was attached.");
  }
  if (audio.size > TRANSCRIPTION_LIMITS.maxAudioBytes) {
    return fail(413, TOO_BIG);
  }
  if (audio.size < TRANSCRIPTION_LIMITS.minAudioBytes) {
    return fail(422, "That clip was too short to hold any words.");
  }
  if (!isAcceptedAudioType(audio.type)) {
    return fail(415, `${audio.type || "That file"} is not a supported audio format.`);
  }

  // Declared by the recorder, so it can be wrong or absent. It is a second opinion on
  // top of the byte cap, never the only one.
  const declaredDuration = form.get("durationMs");
  if (typeof declaredDuration === "string" && declaredDuration.length > 0) {
    const durationMs = Number(declaredDuration);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return fail(400, "`durationMs` must be a number of milliseconds.");
    }
    if (durationMs > TRANSCRIPTION_LIMITS.maxClipMs) {
      return fail(
        413,
        `That clip ran past ${TRANSCRIPTION_LIMITS.maxClipMs / 1_000} seconds. Ask it in a shorter sentence.`,
      );
    }
  }

  if (isMockTranscription()) {
    const payload: TranscriptPayload = { text: MOCK_TRANSCRIPT, mock: true };
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const transcript = await transcribeClip(
      new Uint8Array(await audio.arrayBuffer()),
      audio.type,
      request.signal,
    );
    const payload: TranscriptPayload = { text: transcript.text, mock: false };
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(
      502,
      error instanceof Error ? error.message : "Transcription failed.",
    );
  }
}
