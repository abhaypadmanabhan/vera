import { describe, expect, it } from "vitest";
import { isMockTranscription, transcribeClip } from "@/lib/elevenlabs/scribe";
import { TRANSCRIPTION_LIMITS } from "@/lib/elevenlabs/transcription";

describe("the Scribe client", () => {
  it("is in mock mode here, so no test in this suite can spend a credit", () => {
    expect(isMockTranscription()).toBe(true);
  });

  it("refuses to transcribe rather than quietly reaching ElevenLabs from mock mode", async () => {
    await expect(
      transcribeClip(new Uint8Array(2_000), "audio/webm"),
    ).rejects.toThrow(/mock mode must never transcribe/i);
  });
});

describe("the caps", () => {
  it("keeps the byte ceiling a generous but real proxy for the duration cap", () => {
    // ~48 kbps Opus is the worst case MediaRecorder produces for speech.
    const worstCaseBytes = (48_000 / 8) * (TRANSCRIPTION_LIMITS.maxClipMs / 1_000);
    expect(TRANSCRIPTION_LIMITS.maxAudioBytes).toBeGreaterThan(worstCaseBytes);
    expect(TRANSCRIPTION_LIMITS.minAudioBytes).toBeLessThan(
      TRANSCRIPTION_LIMITS.maxAudioBytes,
    );
  });
});
