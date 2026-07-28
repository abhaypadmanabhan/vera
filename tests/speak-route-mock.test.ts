import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/speak/route";

/**
 * The mock path of /api/speak. These tests run with `VERA_MOCK` unset, so
 * MOCK_MODE is on: the route must answer 204 BEFORE any rate limiting and
 * before anything that could reach ElevenLabs — the mocked demo runs with zero
 * keys, and the player falls back to timed beats on a 204.
 */

function speakRequest(body: unknown): Request {
  return new Request("http://localhost/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "mock-speak" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/speak — mock mode", () => {
  it("returns 204 with zero keys and no body", async () => {
    expect(process.env.VERA_MOCK).toBeUndefined();
    expect(process.env.ELEVENLABS_API_KEY).toBeUndefined();

    const response = await POST(speakRequest({ texts: ["One beat.", "Two beats."] }));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("answers 204 before the rate limiter — the mock demo can never 429", async () => {
    // Far more than the narration bucket allows, from one IP, in one window.
    for (let request = 0; request < 70; request++) {
      const response = await POST(speakRequest({ texts: ["Still silent."] }));
      expect(response.status).toBe(204);
    }
  });
});
