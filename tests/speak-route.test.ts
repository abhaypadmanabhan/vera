import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The armed (non-mock) path of /api/speak. `@/lib/config` is mocked to flip
 * MOCK_MODE off and `@/lib/voice/tts` is mocked so NO ElevenLabs call can ever
 * leave this process — the spy stands at the exact boundary where credits
 * would be spent, and counts what would have been spent.
 */

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, MOCK_MODE: false };
});

const speakBeats = vi.hoisted(() =>
  vi.fn(async (texts: string[]) => ({
    audio: new Uint8Array([0xff, 0xfb, 0x90]),
    contentType: "audio/mpeg",
    beatEndsSeconds: texts.map((_, index) => index + 1),
    text: texts.join(" "),
  })),
);

vi.mock("@/lib/voice/tts", () => ({ speakBeats }));

import { LIMITS } from "@/lib/config";
import { POST, runtime } from "@/app/api/speak/route";

function speakRequest(ip: string, body: unknown): Request {
  return new Request("http://localhost/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const THREE_BEATS = ["The answer is 143,787.36.", "Sales grew in the quarter.", "Ask me anything."];

describe("POST /api/speak — batching", () => {
  beforeEach(() => {
    speakBeats.mockClear();
  });

  it("runs on the Node runtime", () => {
    expect(runtime).toBe("nodejs");
  });

  it("synthesises a slide's beats in ONE ElevenLabs call, not one per beat", async () => {
    const response = await POST(speakRequest("batch-one-call", { texts: THREE_BEATS }));
    expect(response.status).toBe(200);

    expect(speakBeats).toHaveBeenCalledTimes(1);
    expect(speakBeats).toHaveBeenCalledWith(THREE_BEATS, expect.any(AbortSignal));

    const body = (await response.json()) as {
      audio: string;
      contentType: string;
      beatEndsSeconds: number[];
    };
    expect(body.contentType).toBe("audio/mpeg");
    expect(Buffer.from(body.audio, "base64")).toEqual(Buffer.from([0xff, 0xfb, 0x90]));
    // One boundary per beat, so the client can walk the focus along the clip.
    expect(body.beatEndsSeconds).toEqual([1, 2, 3]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects an empty slide, a non-array, a non-JSON body, and an oversized one", async () => {
    expect((await POST(speakRequest("batch-bad-1", { texts: [] }))).status).toBe(400);
    expect((await POST(speakRequest("batch-bad-1", { text: "old shape" }))).status).toBe(400);
    expect((await POST(speakRequest("batch-bad-1", { texts: ["ok", ""] }))).status).toBe(400);
    expect(
      (await POST(speakRequest("batch-bad-1", { texts: Array(13).fill("beat.") }))).status,
    ).toBe(400);

    const notJson = new Request("http://localhost/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "batch-bad-1" },
      body: "not json",
    });
    expect((await POST(notJson)).status).toBe(400);

    // Nothing invalid reached the money boundary.
    expect(speakBeats).not.toHaveBeenCalled();
  });

  it("turns an ElevenLabs failure into a clean 502, never a hang", async () => {
    speakBeats.mockRejectedValueOnce(new Error("upstream said no"));
    const response = await POST(speakRequest("batch-502", { texts: THREE_BEATS }));
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toContain("upstream said no");
  });
});

describe("POST /api/speak — the narration budget is intact, and now counts slides", () => {
  it("allows the bucket, then returns 429 with a Retry-After", async () => {
    speakBeats.mockClear();
    const ip = "speak-rate-limit";
    const limit = LIMITS.narrationRateLimit.requests;

    for (let request = 0; request < limit; request++) {
      const response = await POST(speakRequest(ip, { texts: THREE_BEATS }));
      expect(response.status).toBe(200);
    }
    // 60 requests each carrying THREE beats: 180 beats of narration on one
    // bucket that used to be exhausted by 60 beats.
    expect(speakBeats).toHaveBeenCalledTimes(limit);

    const blocked = await POST(speakRequest(ip, { texts: THREE_BEATS }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(speakBeats).toHaveBeenCalledTimes(limit);
  });
});
