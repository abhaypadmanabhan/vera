import { describe, expect, it } from "vitest";
import { speakLine } from "@/lib/voice/tts";

/** LIVE — spends ElevenLabs credits. Gated behind VERA_LIVE=1. */
describe.skipIf(process.env.VERA_LIVE !== "1")("LIVE elevenlabs", () => {
  it("returns real mp3 audio for one short line", async () => {
    const out = await speakLine("One hundred and forty three thousand, seven hundred and eighty seven dollars.");
    console.log("bytes:", out.audio.length, "type:", out.contentType);
    console.log("text:", out.text);
    expect(out.audio.length).toBeGreaterThan(2000);
    expect(out.contentType).toBe("audio/mpeg");
    // ID3 or MPEG frame sync
    const head = Array.from(out.audio.slice(0, 3)).map((b) => b.toString(16)).join(" ");
    console.log("header bytes:", head);
  }, 90_000);
});
