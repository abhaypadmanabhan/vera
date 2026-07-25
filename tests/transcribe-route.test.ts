import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/config";
import {
  MOCK_TRANSCRIPT,
  TRANSCRIPTION_LIMITS,
  baseAudioType,
  isAcceptedAudioType,
} from "@/lib/elevenlabs/transcription";
import { POST, runtime } from "@/app/api/transcribe/route";

/**
 * The tests run with `VERA_MOCK` unset, so `MOCK_MODE` is on and no ElevenLabs call can
 * be made from here. That is the point: everything below exercises the guards that stand
 * between a click and a credit.
 */

function clip(bytes: number, type = "audio/webm;codecs=opus"): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

function transcribeRequest(
  ip: string,
  parts: { audio?: Blob; durationMs?: string } = {},
): Request {
  const body = new FormData();
  const audio = parts.audio ?? clip(TRANSCRIPTION_LIMITS.minAudioBytes + 1);
  body.append("audio", audio, "question.webm");
  if (parts.durationMs !== undefined) body.append("durationMs", parts.durationMs);
  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body,
  });
}

async function errorOf(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: string };
  return body.error ?? "";
}

describe("POST /api/transcribe — mock path", () => {
  it("runs on the Node runtime and returns a labelled canned transcript with zero keys", async () => {
    expect(runtime).toBe("nodejs");
    expect(process.env.ELEVENLABS_API_KEY).toBeUndefined();

    const response = await POST(transcribeRequest("mock-path"));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { text: string; mock: boolean };
    // `mock: true` is what the UI reads to print "no audio left this machine".
    expect(body.mock).toBe(true);
    expect(body.text).toBe(MOCK_TRANSCRIPT);
    expect(body.text.length).toBeGreaterThan(0);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("never auto-submits — the response carries text and nothing that could run it", async () => {
    const response = await POST(transcribeRequest("mock-shape"));
    expect(Object.keys(await response.json())).toEqual(["text", "mock"]);
  });
});

describe("POST /api/transcribe — the money guards", () => {
  it("rate limits the same way the analyze route does, and says how long to wait", async () => {
    const ip = "transcribe-rate-limit";

    for (let request = 0; request < LIMITS.rateLimit.requests; request++) {
      expect((await POST(transcribeRequest(ip))).status).toBe(200);
    }

    const blocked = await POST(transcribeRequest(ip));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    await expect(errorOf(blocked)).resolves.toContain("Too many");
  });

  it("refuses an oversized clip from the content-length header, before reading it", async () => {
    const request = new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: {
        "x-forwarded-for": "transcribe-declared-size",
        "content-length": String(TRANSCRIPTION_LIMITS.maxAudioBytes + 1),
        "content-type": "multipart/form-data; boundary=never-read",
      },
      body: "this body is never parsed",
    });

    const response = await POST(request);
    expect(response.status).toBe(413);
    await expect(errorOf(response)).resolves.toMatch(/MB/);
  });

  it("refuses an oversized clip that lied about its content-length", async () => {
    const response = await POST(
      transcribeRequest("transcribe-real-size", {
        audio: clip(TRANSCRIPTION_LIMITS.maxAudioBytes + 1),
      }),
    );
    expect(response.status).toBe(413);
  });

  it("refuses a clip that declares more than the duration cap", async () => {
    const response = await POST(
      transcribeRequest("transcribe-duration", {
        durationMs: String(TRANSCRIPTION_LIMITS.maxClipMs + 1),
      }),
    );
    expect(response.status).toBe(413);
    await expect(errorOf(response)).resolves.toMatch(/seconds/);
  });

  it("accepts a clip inside the duration cap", async () => {
    const response = await POST(
      transcribeRequest("transcribe-duration-ok", {
        durationMs: String(TRANSCRIPTION_LIMITS.maxClipMs),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects a non-numeric declared duration", async () => {
    const response = await POST(
      transcribeRequest("transcribe-duration-junk", { durationMs: "soon" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/transcribe — bad input", () => {
  it("rejects a body that is not multipart form data", async () => {
    const response = await POST(
      new Request("http://localhost/api/transcribe", {
        method: "POST",
        headers: { "x-forwarded-for": "transcribe-json", "Content-Type": "application/json" },
        body: JSON.stringify({ audio: "nope" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a form with no audio attached", async () => {
    const body = new FormData();
    body.append("durationMs", "1000");
    const response = await POST(
      new Request("http://localhost/api/transcribe", {
        method: "POST",
        headers: { "x-forwarded-for": "transcribe-no-audio" },
        body,
      }),
    );
    expect(response.status).toBe(400);
    await expect(errorOf(response)).resolves.toContain("No audio");
  });

  it("treats a clip below the floor as no speech rather than spending a credit on it", async () => {
    const response = await POST(
      transcribeRequest("transcribe-tiny", {
        audio: clip(TRANSCRIPTION_LIMITS.minAudioBytes - 1),
      }),
    );
    expect(response.status).toBe(422);
    await expect(errorOf(response)).resolves.toContain("too short");
  });

  it("rejects a container we cannot name", async () => {
    const response = await POST(
      transcribeRequest("transcribe-format", {
        audio: clip(TRANSCRIPTION_LIMITS.minAudioBytes + 1, "application/zip"),
      }),
    );
    expect(response.status).toBe(415);
  });
});

describe("audio type matching", () => {
  it("strips the codec parameter before matching", () => {
    expect(baseAudioType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseAudioType("AUDIO/MP4")).toBe("audio/mp4");
  });

  it("accepts what MediaRecorder actually emits, and nothing else", () => {
    for (const type of ["audio/webm;codecs=opus", "audio/ogg", "audio/mp4", "audio/wav"]) {
      expect(isAcceptedAudioType(type)).toBe(true);
    }
    for (const type of ["", "video/mp4", "text/plain"]) {
      expect(isAcceptedAudioType(type)).toBe(false);
    }
  });
});
