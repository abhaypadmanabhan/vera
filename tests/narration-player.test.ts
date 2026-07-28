import { describe, expect, it } from "vitest";
import { buildDeck } from "@/lib/deck";
import type {
  NarrationAudio,
  NarrationPlayerDeps,
  SpeakResult,
} from "@/components/vera/narration-player";
import {
  createNarrationPlayer,
  proportionalBeatEnds,
} from "@/components/vera/narration-player";
import { beatEndsFromAlignment } from "@/lib/voice/tts";
import type { DatasetProfile, Finding, SchemaEvidence } from "@/lib/types";

/**
 * The narration batching proofs. No React, no network, no ElevenLabs: the
 * player is framework-free with injected seams, so the two properties the task
 * demands — ONE call per slide, and STOP silences the slide with no late beat
 * ever arriving — are exercised directly, not argued.
 */

class FakeAudio implements NarrationAudio {
  currentTime = 0;
  duration: number;
  src = "";
  played = false;
  paused = false;
  failPlay = false;
  private listeners = new Map<string, Set<() => void>>();

  constructor(duration: number) {
    this.duration = duration;
  }

  async play(): Promise<void> {
    if (this.failPlay) throw new DOMException("blocked", "NotAllowedError");
    this.played = true;
  }

  pause(): void {
    this.paused = true;
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  seek(time: number): void {
    this.currentTime = time;
    this.emit("timeupdate");
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

interface PendingSpeak {
  texts: string[];
  resolve: (result: SpeakResult | "unavailable") => void;
  reject: (error: unknown) => void;
}

interface Harness {
  deps: NarrationPlayerDeps;
  pending: PendingSpeak[];
  clips: FakeAudio[];
  speakingLog: boolean[];
  availableLog: boolean[];
  beats: number;
  failNextPlay: () => void;
}

const FLUSH = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function harness(clipDuration = 3): Harness {
  const pending: PendingSpeak[] = [];
  const speakingLog: boolean[] = [];
  const availableLog: boolean[] = [];
  const clips: FakeAudio[] = [];
  let beats = 0;
  let failPlay = false;

  const deps: NarrationPlayerDeps = {
    speak: (texts) =>
      new Promise((resolve, reject) => {
        pending.push({ texts, resolve, reject });
      }),
    createAudio: () => {
      const clip = new FakeAudio(clipDuration);
      clip.failPlay = failPlay;
      failPlay = false;
      clips.push(clip);
      return clip;
    },
    bytesToUrl: () => "blob:fake",
    revokeUrl: () => undefined,
    onBeat: () => {
      beats++;
    },
    onSpeakingChange: (speaking) => speakingLog.push(speaking),
    onAvailableChange: (available) => availableLog.push(available),
  };

  return {
    deps,
    pending,
    clips,
    speakingLog,
    availableLog,
    failNextPlay: () => {
      failPlay = true;
    },
    get beats() {
      return beats;
    },
  };
}

function resultFor(ends: number[] | null): SpeakResult {
  return {
    audio: Buffer.from("fake-mp3").toString("base64"),
    contentType: "audio/mpeg",
    beatEndsSeconds: ends,
  };
}

describe("narration player — one call per slide", () => {
  it("fetches the whole slide in a single speak() call carrying every beat", async () => {
    const h = harness();
    const player = createNarrationPlayer(h.deps);

    player.play(["First beat.", "Second beat.", "Third beat."]);
    expect(h.pending.map((call) => call.texts)).toEqual([
      ["First beat.", "Second beat.", "Third beat."],
    ]);

    h.pending[0]!.resolve(resultFor([1, 2, 3]));
    await FLUSH();
    expect(h.pending).toHaveLength(1);
    expect(h.clips).toHaveLength(1);
    expect(h.clips[0]?.played).toBe(true);
  });

  it("walks beats along the clip at the alignment boundaries, once each, in order", async () => {
    const h = harness(3);
    const player = createNarrationPlayer(h.deps);
    player.play(["a", "b", "c"]);
    h.pending[0]!.resolve(resultFor([1, 2, 3]));
    await FLUSH();
    const clip = h.clips[0]!;

    clip.seek(0.5);
    expect(h.beats).toBe(0);
    clip.seek(1.2);
    expect(h.beats).toBe(1);
    clip.seek(1.8);
    expect(h.beats).toBe(1);
    clip.seek(2.5);
    expect(h.beats).toBe(2);
    // The last beat belongs to the clip's end, not to a timer.
    clip.emit("ended");
    expect(h.beats).toBe(3);
    expect(h.speakingLog).toEqual([true, false]);
  });

  it("flushes beats a coarse timeupdate skipped, so no beat is ever lost", async () => {
    const h = harness(3);
    const player = createNarrationPlayer(h.deps);
    player.play(["a", "b", "c"]);
    h.pending[0]!.resolve(resultFor([0.05, 0.1, 3]));
    await FLUSH();
    const clip = h.clips[0]!;

    // timeupdate ticks ~4Hz in a browser; a 250ms granularity must not skip beats.
    clip.seek(0.25);
    expect(h.beats).toBe(2);
    clip.emit("ended");
    expect(h.beats).toBe(3);
  });

  it("estimates boundaries proportionally when the service returned no alignment", async () => {
    expect(proportionalBeatEnds(["a", "b", "c"], 3)).toEqual([1, 2, 3]);
    expect(proportionalBeatEnds(["aaaa", "aa"], 3)).toEqual([2, 3]);

    const h = harness(3);
    const player = createNarrationPlayer(h.deps);
    player.play(["a", "b", "c"]);
    h.pending[0]!.resolve(resultFor(null));
    await FLUSH();
    const clip = h.clips[0]!;

    clip.seek(1.5);
    expect(h.beats).toBe(1);
    clip.emit("ended");
    expect(h.beats).toBe(3);
  });

  it("marks audio unavailable on 204/mock and never creates a clip", async () => {
    const h = harness();
    const player = createNarrationPlayer(h.deps);
    player.play(["a", "b"]);
    h.pending[0]!.resolve("unavailable");
    await FLUSH();

    expect(h.availableLog).toEqual([false]);
    expect(h.clips).toHaveLength(0);
    expect(h.beats).toBe(0);
  });

  it("treats blocked autoplay like no audio, so the deck falls back to its timer", async () => {
    const h = harness();
    h.failNextPlay();
    const player = createNarrationPlayer(h.deps);
    player.play(["a"]);
    h.pending[0]!.resolve(resultFor([3]));
    await FLUSH();

    expect(h.clips).toHaveLength(1);
    expect(h.clips[0]?.played).toBe(false);
    expect(h.availableLog).toEqual([false]);
    expect(h.speakingLog).toEqual([false]);
    expect(h.beats).toBe(0);
  });

  it("marks audio unavailable when the speak request itself fails", async () => {
    const h = harness();
    const player = createNarrationPlayer(h.deps);
    player.play(["a"]);
    h.pending[0]!.reject(new Error("502 from the route"));
    await FLUSH();

    expect(h.availableLog).toEqual([false]);
    expect(h.speakingLog).toEqual([false]);
    expect(h.clips).toHaveLength(0);
  });
});

describe("narration player — STOP kills the slide instantly and forever", () => {
  it("STOP while the request is in flight: the late response never plays, no beat fires", async () => {
    const h = harness();
    const player = createNarrationPlayer(h.deps);
    player.play(["a", "b", "c"]);

    player.stop();
    expect(h.speakingLog).toEqual([false]);
    // The in-flight request was aborted — and the route passes request.signal
    // on to ElevenLabs, so the spend stops too.

    // The clip for the stopped slide arrives AFTER the user stopped it.
    h.pending[0]!.resolve(resultFor([1, 2, 3]));
    await FLUSH();

    expect(h.clips).toHaveLength(0);
    expect(h.beats).toBe(0);
    expect(h.speakingLog).toEqual([false]);
  });

  it("STOP mid-play: the clip pauses immediately and neither timeupdate nor ended fires another beat", async () => {
    const h = harness(3);
    const player = createNarrationPlayer(h.deps);
    player.play(["a", "b", "c"]);
    h.pending[0]!.resolve(resultFor([1, 2, 3]));
    await FLUSH();
    const clip = h.clips[0]!;

    clip.seek(1.2);
    expect(h.beats).toBe(1);

    player.stop();
    expect(clip.paused).toBe(true);
    expect(clip.src).toBe("");
    expect(h.speakingLog.at(-1)).toBe(false);

    // Events already queued on the dead clip must not advance another beat.
    clip.seek(2.9);
    clip.emit("ended");
    expect(h.beats).toBe(1);
  });

  it("an aborted request that rejects after STOP stays silent", async () => {
    const h = harness();
    const player = createNarrationPlayer(h.deps);
    player.play(["a", "b"]);
    player.stop();
    h.pending[0]!.reject(new DOMException("The user aborted a request.", "AbortError"));
    await FLUSH();

    expect(h.clips).toHaveLength(0);
    expect(h.beats).toBe(0);
    expect(h.availableLog).toEqual([]);
  });

  it("a slide change supersedes the old slide: its late audio can never play over the new one", async () => {
    const h = harness(3);
    const player = createNarrationPlayer(h.deps);

    player.play(["old one", "old two"]);
    player.stop(); // what the hook's cleanup does when the slide changes
    player.play(["new one"]);
    expect(h.pending.map((call) => call.texts)).toEqual([
      ["old one", "old two"],
      ["new one"],
    ]);

    // The OLD slide's audio resolves late — after the new slide was requested.
    h.pending[0]!.resolve(resultFor([1, 2]));
    await FLUSH();
    expect(h.clips).toHaveLength(0);

    // The new slide plays normally and its beats still fire.
    h.pending[1]!.resolve(resultFor([3]));
    await FLUSH();
    expect(h.clips).toHaveLength(1);
    h.clips[0]!.emit("ended");
    expect(h.beats).toBe(1);
  });
});

describe("beatEndsFromAlignment — exact boundaries from the service's alignment", () => {
  function alignmentFor(joined: string, secondsPerChar: number) {
    const characters = [...joined];
    return {
      characters,
      characterStartTimesSeconds: characters.map((_, i) => i * secondsPerChar),
      characterEndTimesSeconds: characters.map((_, i) => (i + 1) * secondsPerChar),
    };
  }

  it("maps each beat's end to the end time of its last character", () => {
    const texts = ["ab", "cd", "ef"];
    // joined: "ab cd ef" — beat ends at char indexes 1, 4, 7.
    const ends = beatEndsFromAlignment(texts, alignmentFor("ab cd ef", 0.5));
    expect(ends).toEqual([1, 2.5, 4]);
  });

  it("returns null when the alignment does not describe the joined text", () => {
    const texts = ["ab", "cd"];
    const wrong = alignmentFor("ab cd", 0.5);
    wrong.characters[1] = "X";
    expect(beatEndsFromAlignment(texts, wrong)).toBeNull();
    expect(beatEndsFromAlignment(texts, alignmentFor("ab c", 0.5))).toBeNull();
    expect(beatEndsFromAlignment(texts, null)).toBeNull();
    expect(beatEndsFromAlignment(texts, undefined)).toBeNull();
  });
});

describe("the call count, measured on a real deck", () => {
  const PROFILE: DatasetProfile = {
    datasetId: "superstore",
    filename: "superstore.csv",
    rowCount: 9994,
    columns: [],
    duplicateRowCount: 1,
    crossChecks: [],
    notes: [],
  };

  const EVIDENCE: SchemaEvidence = {
    claim: "OrderDate is DD/MM/YYYY",
    supportingRows: 5952,
    contradictingRows: 0,
    examples: ["15/04/2019"],
    method: "5,952 values have a first component above 12, which cannot be a month.",
  };

  /** A representative deck: a finding, two grounded comparisons, one caveat. */
  const REPRESENTATIVE: Extract<Finding, { verdict: "verified" }> = {
    verdict: "verified",
    value: 143787.36,
    unit: null,
    claim: "Total sales in Q3 2018 were 143,787.36.",
    code: { language: "python", source: "print(1)", explanation: "x", lineCount: 6 },
    execution: {
      exitCode: 0,
      stdout: "",
      stderr: "",
      value: 143787.36,
      contextValues: {},
      durationMs: 828,
    },
    grounding: {
      columns: ["OrderDate", "Sales"],
      rowCount: 9994,
      rowRange: [0, 9993],
      sampleCells: [],
      schemaEvidence: [EVIDENCE],
    },
    context: [
      {
        name: "prior_period",
        description: "the same quarter a year earlier",
        value: 121004.2,
        columnsUsed: ["OrderDate", "Sales"],
      },
      {
        name: "change_on_prior_period",
        description: "higher than the same quarter a year earlier",
        value: "19%",
        columnsUsed: ["OrderDate", "Sales"],
      },
    ],
    valence: "neutral",
    attempts: 1,
  };

  it("narrates a 10-beat deck with exactly 5 speak calls — one per narrated slide", async () => {
    const deck = buildDeck("What were sales in Q3 2018?", REPRESENTATIVE, PROFILE);
    const narrated = deck.slides.filter((slide) => slide.beats.length > 0);
    const totalBeats = deck.slides.reduce((sum, slide) => sum + slide.beats.length, 0);

    // The deck this models: opener, finding, meaning (2), caveat (2), summary (3).
    expect(narrated.map((slide) => slide.kind)).toEqual([
      "opener",
      "finding",
      "meaning",
      "caveat",
      "summary",
    ]);
    expect(totalBeats).toBe(10);

    // Drive the whole deck through the player exactly as the hook would: one
    // play() per slide, the clip runs to its end, onBeat advances the deck.
    const h = harness(2);
    const player = createNarrationPlayer(h.deps);

    for (const slide of narrated) {
      const texts = slide.beats.map((beat) => beat.spoken);
      player.play(texts);
      h.pending.at(-1)!.resolve(resultFor(null));
      await FLUSH();
      h.clips.at(-1)!.emit("ended");
      player.stop();
    }

    // BEFORE: one call per beat — this deck cost 10 calls; the 2026-07-26 live
    // session's 3 questions cost 26. AFTER: one call per narrated slide.
    expect(h.pending).toHaveLength(5);
    expect(h.beats).toBe(totalBeats);
    // Every call carried its whole slide, and no call carried more than that.
    for (const [index, call] of h.pending.entries()) {
      expect(call.texts).toEqual(narrated[index]!.beats.map((beat) => beat.spoken));
    }
  });
});
