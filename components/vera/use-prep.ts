"use client";

import { useCallback, useRef, useState } from "react";
import type { PrepReport } from "@/lib/prepare/run";
import { readEventStream } from "@/lib/stream";
import type { CsvPayload, DatasetSummary, StageStatus } from "@/lib/types";
import type { PrepStageId, PrepStageMessage } from "./prep-screen";
import { acceptFile } from "./upload-dropzone";

/**
 * The client half of prep. Owns the `/api/prepare` connection and folds its
 * `prep-stage` events into render-ready messages, exactly as `useAnalysis`
 * does for a run.
 *
 * It lives above the screens, not inside them: prep must survive the reader
 * asking a question about the demo file while their own file is still being
 * prepared.
 */

interface PrepStageWireEvent {
  type: "prep-stage";
  stage: PrepStageId;
  status: StageStatus;
  detail: string;
}

interface PrepReportWireEvent {
  type: "prep-report";
  summary: DatasetSummary;
  report: PrepReport;
}

type PrepWireEvent = PrepStageWireEvent | PrepReportWireEvent;

export interface PrepState {
  /** The uploaded file's name, from the moment it is accepted. */
  filename: string | null;
  messages: PrepStageMessage[];
  report: PrepReport | null;
  /** The uploaded file as the server profiled it. Replaces the demo file on record. */
  summary: DatasetSummary | null;
  /** Sent with every later `/api/analyze` call, so she answers about this file. */
  upload: CsvPayload | null;
  error: string | null;
  isPreparing: boolean;
}

const IDLE: PrepState = {
  filename: null,
  messages: [],
  report: null,
  summary: null,
  upload: null,
  error: null,
  isPreparing: false,
};

/** The plan asks for `FileReader`; it also keeps the read cancellable and off the main path. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

async function errorFrom(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const message = (body as { error: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  } catch {
    // A body that is not JSON tells us nothing the status has not already.
  }
  return "Vera could not prepare that file.";
}

export function usePrepare() {
  const [state, setState] = useState<PrepState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const prepare = useCallback(async (file: File) => {
    // The newest selection always wins, and a rejected file is still a
    // selection. Aborting after the validation check meant a prep already in
    // flight kept streaming: its `prep-report` landed on top of the rejection
    // message and installed the file the reader had just replaced as the
    // active dataset — an answer about the wrong file, with an error on screen.
    abortRef.current?.abort();
    abortRef.current = null;

    // The money rule: guard in the browser, before a byte reaches a paid route.
    const verdict = acceptFile(file);
    if (!verdict.ok) {
      setState({ ...IDLE, filename: file.name, error: verdict.reason ?? null });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...IDLE, filename: file.name, isPreparing: true });

    try {
      const content = await readText(file);
      const response = await fetch("/api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload: { filename: file.name, content } }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const message = await errorFrom(response);
        setState((s) => ({ ...s, isPreparing: false, error: message }));
        return;
      }

      for await (const raw of readEventStream(response.body)) {
        // Aborting is not enough on its own: `readEventStream` yields every
        // event it already parsed out of a delivered chunk without touching the
        // reader again, so a superseded run can still hand back two or three
        // events after its signal fires. Only the current run may write state.
        if (abortRef.current !== controller) return;
        const event = raw as unknown as PrepWireEvent;
        if (event.type === "prep-stage") {
          const message: PrepStageMessage = {
            stage: event.stage,
            status: event.status,
            detail: event.detail,
          };
          setState((s) => ({ ...s, messages: [...s.messages, message] }));
        } else if (event.type === "prep-report") {
          setState((s) => ({
            ...s,
            report: event.report,
            summary: event.summary,
            upload: { filename: file.name, content },
            isPreparing: false,
          }));
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((s) => ({
        ...s,
        isPreparing: false,
        error: error instanceof Error ? error.message : "Vera could not prepare that file.",
      }));
    } finally {
      // Only the run that is still the current one may declare prep finished.
      // Unguarded, an aborted run cleared the flag while its replacement was
      // still preparing, and the screen went idle mid-run.
      if (abortRef.current === controller) {
        setState((s) => (s.isPreparing ? { ...s, isPreparing: false } : s));
      }
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE);
  }, []);

  return { ...state, prepare, clear } as const;
}
