import { z } from "zod";
import { MOCK_MODE } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { speakBeats } from "@/lib/voice/tts";

export const runtime = "nodejs";

/**
 * Vera's voice. Speaks one slide's narration beats in a SINGLE ElevenLabs call.
 *
 * Beats used to be fetched one at a time — 26 calls served 3 questions on
 * 2026-07-26 and a single local user hit a 429 mid-sentence. Now the client
 * posts every beat of the slide at once, gets one audio clip plus the exact
 * end time of each beat inside it, and walks the UI focus along those
 * boundaries. What Vera says and when the focus moves are unchanged; only the
 * number of round trips is not.
 *
 * The honesty rule is enforced upstream and structurally: `buildDeck` returns
 * zero slides for an unverified finding, so an unproven number has no beats and
 * there is nothing for the client to ask this route to say.
 *
 * Spends ElevenLabs credits. Silent (204) in mock mode so the mocked demo never
 * calls out and never pretends to have audio.
 */

const bodySchema = z.object({
  texts: z
    .array(z.string().trim().min(1).max(600))
    .min(1)
    .max(12)
    .refine((texts) => texts.join(" ").length <= 2_400, {
      message: "Narration is too long.",
    }),
});

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request): Promise<Response> {
  if (MOCK_MODE) {
    // No audio in mock mode. The player falls back to timed beats.
    return new Response(null, { status: 204 });
  }

  // Narration draws on its own budget: one call per slide means a single deck
  // would otherwise consume the whole analysis allowance. See lib/config.ts.
  const rate = checkRateLimit(clientIp(request), Date.now(), "narration");
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const spoken = await speakBeats(parsed.data.texts, request.signal);
    return Response.json(
      {
        audio: Buffer.from(spoken.audio).toString("base64"),
        contentType: spoken.contentType,
        beatEndsSeconds: spoken.beatEndsSeconds,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Speech failed." },
      { status: 502 },
    );
  }
}
