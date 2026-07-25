import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MIC_STATUS_ID,
  MicButton,
  MicStatus,
  clock,
  micLine,
} from "@/components/vera/mic-button";
import { MIC_MESSAGES, TRANSCRIPTION_LIMITS } from "@/lib/elevenlabs/transcription";
import type { Microphone } from "@/components/vera/use-microphone";

/**
 * `MicButton` and `MicStatus` are pure functions of the mic's state, so every path a
 * user can hit — including the four failure paths — is renderable without a browser.
 */

const base: Microphone = {
  phase: "idle",
  problem: null,
  wasMock: false,
  elapsedMs: 0,
  supported: true,
  message: null,
  toggle: () => undefined,
};

const mic = (over: Partial<Microphone> = {}): Microphone => ({ ...base, ...over });

const button = (state: Microphone, reducedMotion = false): string =>
  renderToStaticMarkup(createElement(MicButton, { mic: state, reducedMotion }));

const status = (state: Microphone): string =>
  renderToStaticMarkup(
    createElement(MicStatus, { mic: state, idleHint: "Enter to ask" }),
  );

describe("the mic button", () => {
  it("is a real button, so it is keyboard operable and labelled for a screen reader", () => {
    const html = button(mic());
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Ask by voice"');
    expect(html).toContain(`aria-describedby="${MIC_STATUS_ID}"`);
    expect(html).not.toContain("<div role=\"button\"");
  });

  it("is a toggle, and says which way it is set", () => {
    expect(button(mic())).toContain('aria-pressed="false"');
    expect(button(mic({ phase: "recording" }))).toContain('aria-pressed="true"');
    expect(button(mic({ phase: "recording" }))).toContain("Stop recording");
  });

  it("stays a labelled, disabled button when the browser cannot record — never a dead control", () => {
    const html = button(mic({ supported: false }));
    expect(html).toContain("disabled");
    expect(html).toContain("Voice input is unavailable in this browser");
  });

  it("animates the recording state, and drops the animation for reduced motion", () => {
    expect(button(mic({ phase: "recording" }))).toContain("v-breathe");
    expect(button(mic({ phase: "recording" }), true)).not.toContain("v-breathe");
    expect(button(mic({ phase: "transcribing" }), true)).not.toContain("v-breathe");
  });

  it("cannot be pressed while it is already working", () => {
    expect(button(mic({ phase: "transcribing" }))).toContain("disabled");
    expect(button(mic({ phase: "requesting" }))).toContain("disabled");
  });
});

describe("the status line", () => {
  it("is a live region, so state changes are announced", () => {
    const html = status(mic());
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(`id="${MIC_STATUS_ID}"`);
  });

  it("holds the keyboard hint when the mic has nothing to say, so nothing on screen moves", () => {
    expect(status(mic())).toContain("Enter to ask");
  });

  it("counts the clip against the real cap while recording", () => {
    expect(micLine(mic({ phase: "recording", elapsedMs: 7_400 }))).toBe(
      "Listening · 0:07 / 0:30",
    );
    expect(clock(0)).toBe("0:00");
    expect(clock(TRANSCRIPTION_LIMITS.maxClipMs)).toBe("0:30");
  });

  it("says plainly that a mock transcript is a mock", () => {
    expect(micLine(mic({ wasMock: true }))).toMatch(/Mock transcript/);
  });

  it("gives every failure path a sentence that says what to do next", () => {
    const paths = [
      "denied",
      "no-device",
      "unsupported",
      "no-speech",
      "in-use",
      "rate-limited",
      "failed",
    ] as const;
    for (const problem of paths) {
      const line = micLine(mic({ problem, message: MIC_MESSAGES[problem] }));
      expect(line, problem).toBe(MIC_MESSAGES[problem]);
      expect(line, problem).toMatch(/instead|then|Try|Press|Plug|Close/);
    }
  });

  it("reports an unsupported browser even before an attempt is made", () => {
    expect(micLine(mic({ supported: false }))).toContain("can't record audio");
  });
});
