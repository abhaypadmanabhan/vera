"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MIC_MESSAGES,
  TRANSCRIPTION_LIMITS,
  type MicProblem,
  type TranscriptPayload,
} from "@/lib/elevenlabs/transcription";

/**
 * The whole mic lifecycle, kept out of the view. `MicButton` and `MicStatus` are pure
 * functions of the state this returns.
 *
 * It never submits anything. The transcript is handed back to the caller, which drops it
 * into the question box; the user reads it and presses Enter.
 */

export type MicPhase = "idle" | "requesting" | "recording" | "transcribing";

export interface MicState {
  phase: MicPhase;
  /** Set when the last attempt failed. Cleared the moment a new one starts. */
  problem: MicProblem | null;
  /** True when the last transcript was canned because there was no key to spend. */
  wasMock: boolean;
  /** How long the current clip has been running. Drives the `0:07 / 0:30` readout. */
  elapsedMs: number;
  /** False once we know this browser cannot record. The button says so instead of dying. */
  supported: boolean;
}

/** Containers to try, best first. Safari only takes the mp4 one. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/**
 * Whether this browser can record at all, read the same way `useReducedMotion` reads the
 * media query. A browser does not grow a `MediaRecorder` mid-session, so nothing ever
 * needs to fire the subscription.
 */
const neverChanges = (): (() => void) => () => undefined;
/** The server assumes yes, so the first paint shows a live button rather than a struck-out one. */
const assumeSupported = (): boolean => true;

/** Map the browser's `getUserMedia` rejection onto something a person can act on. */
function problemFromMediaError(error: unknown): MicProblem {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-device";
  if (name === "NotReadableError" || name === "AbortError") return "in-use";
  return "failed";
}

export interface Microphone extends MicState {
  /** The sentence to show. Null when there is nothing to say. */
  message: string | null;
  /** Press the mic: starts a recording, or stops one that is running. */
  toggle: () => void;
}

export function useMicrophone(onTranscript: (text: string) => void): Microphone {
  const [phase, setPhase] = useState<MicPhase>("idle");
  const [problem, setProblem] = useState<MicProblem | null>(null);
  const [wasMock, setWasMock] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const supported = useSyncExternalStore(neverChanges, canRecord, assumeSupported);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  // Latest transcript handler, so an in-flight recording never calls a stale closure.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  const releaseHardware = useCallback((): void => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    stopTimerRef.current = null;
    tickRef.current = null;
    // Dropping every track is what turns the browser's recording indicator off.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // A recording must not outlive the screen.
  useEffect(() => releaseHardware, [releaseHardware]);

  const send = useCallback(
    async (clip: Blob, durationMs: number): Promise<void> => {
      if (clip.size < TRANSCRIPTION_LIMITS.minAudioBytes) {
        setPhase("idle");
        setProblem("no-speech");
        return;
      }

      setPhase("transcribing");
      const body = new FormData();
      body.append("audio", clip, "question");
      body.append("durationMs", String(Math.round(durationMs)));

      try {
        const response = await fetch("/api/transcribe", { method: "POST", body });
        if (!response.ok) {
          setPhase("idle");
          // Each refusal the route can give has its own sentence. Collapsing them all
          // into "failed" would tell someone to retype a question they only need to
          // repeat, or to wait out a limit they never hit.
          setProblem(
            response.status === 413
              ? "too-long"
              : response.status === 422
                ? "no-speech"
                : response.status === 429
                  ? "rate-limited"
                  : "failed",
          );
          return;
        }
        const payload = (await response.json()) as TranscriptPayload;
        const text = payload.text.trim();
        setWasMock(payload.mock);
        setPhase("idle");
        if (text.length === 0) {
          setProblem("no-speech");
          return;
        }
        onTranscriptRef.current(text);
      } catch {
        setPhase("idle");
        setProblem("failed");
      }
    },
    [],
  );

  const stop = useCallback((): void => {
    // `onstop` does the rest — it is the only place that sees the finished blob.
    recorderRef.current?.stop();
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (!canRecord()) {
      setProblem("unsupported");
      return;
    }

    setProblem(null);
    setWasMock(false);
    setElapsedMs(0);
    setPhase("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setPhase("idle");
      setProblem(problemFromMediaError(error));
      return;
    }

    // A device can exist and still hand back nothing to record.
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      setPhase("idle");
      setProblem("no-device");
      return;
    }

    let recorder: MediaRecorder;
    try {
      const mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setPhase("idle");
      setProblem("failed");
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      releaseHardware();
      setPhase("idle");
      setProblem("failed");
    };
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      releaseHardware();
      void send(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), durationMs);
    };

    recorder.start();
    setPhase("recording");

    // The cap is real: the recorder stops itself rather than trusting anyone to.
    stopTimerRef.current = setTimeout(stop, TRANSCRIPTION_LIMITS.maxClipMs);
    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
  }, [releaseHardware, send, stop]);

  const toggle = useCallback((): void => {
    if (phase === "recording") {
      stop();
      return;
    }
    if (phase === "idle") void start();
  }, [phase, start, stop]);

  return {
    phase,
    problem,
    wasMock,
    elapsedMs,
    supported,
    message: problem ? MIC_MESSAGES[problem] : null,
    toggle,
  };
}
