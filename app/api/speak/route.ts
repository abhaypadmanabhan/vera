import { z } from "zod";
import { MOCK_MODE } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { speakLine } from "@/lib/voice/tts";

export const runtime = "nodejs";

/**
 * Vera's voice. Speaks ONE narration beat.
 *
 * The honesty rule is enforced upstream and structurally: `buildDeck` returns zero
 * slides for an unverified finding, so an unproven number has no beats and there is
 * nothing for the client to ask this route to say.
 *
 * Spends ElevenLabs credits. Silent (204) in mock mode so the mocked demo never
 * calls out and never pretends to have audio.
 */

const bodySchema = z.object({
  text: z.string().trim().min(1).max(600),
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

  const rate = checkRateLimit(clientIp(request));
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
    const spoken = await speakLine(parsed.data.text, request.signal);
    return new Response(new Uint8Array(spoken.audio), {
      headers: {
        "Content-Type": spoken.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Speech failed." },
      { status: 502 },
    );
  }
}
