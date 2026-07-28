"use client";

import { useCallback, useRef } from "react";
import { ArrowUp } from "lucide-react";
import type { DatasetSummary } from "@/lib/types";
import { formatBytes, formatCount } from "./format";
import { MicButton, MicStatus } from "./mic-button";
import { PrepScreen } from "./prep-screen";
import { useMicrophone } from "./use-microphone";
import type { PrepState } from "./use-prep";
import { useReducedMotion } from "./use-reduced-motion";
import { UploadButton, UploadDropzone } from "./upload-dropzone";

/**
 * Screen 1 — Ask. Calm and near-empty (DESIGN.md v3 "Layout"). One question box,
 * chips, one quiet line naming the file on record. Nothing else: this screen
 * should feel like it is waiting, not loading.
 *
 * It is also the front door. A CSV can be dropped anywhere on this column, or
 * picked from the line naming the file on record. While that file is being
 * prepared the box stays live — the file already on record remains askable.
 */
export function AskScreen({
  question,
  onQuestionChange,
  onSubmit,
  onAsk,
  suggestions,
  dataset,
  prep,
  onFile,
}: {
  question: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  /** Run this exact question now. Used by the chips so one click is one run. */
  onAsk: (value: string) => void;
  suggestions: string[];
  dataset: DatasetSummary;
  prep: PrepState;
  onFile: (file: File) => void;
}) {
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const ready = question.trim().length > 0;
  const reducedMotion = useReducedMotion();

  const submit = () => {
    if (ready) onSubmit();
  };

  /**
   * Speech lands in the box and stops there. Vera never runs a question she only heard —
   * the user reads it back and presses Enter. Appending rather than replacing means a
   * half-typed question survives being finished out loud.
   */
  const acceptTranscript = useCallback(
    (text: string) => {
      onQuestionChange(question.trim().length > 0 ? `${question.trim()} ${text}` : text);
      boxRef.current?.focus();
    },
    [onQuestionChange, question],
  );

  const mic = useMicrophone(acceptTranscript);

  return (
    <UploadDropzone onFile={onFile} busy={prep.isPreparing}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 pb-24">
      <h1
        className="v-reveal text-title font-medium text-balance text-ink"
        style={{ ["--step" as string]: 0 }}
      >
        What do you want to know?
      </h1>
      <p className="v-reveal mt-3 text-body text-ink-muted" style={{ ["--step" as string]: 1 }}>
        Vera writes the analysis, runs it, and files the code and the exact cells beside the number.
      </p>

      <form
        className="v-reveal mt-8"
        style={{ ["--step" as string]: 2 }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="v-card group relative shadow-lift transition-[border-color] duration-150 focus-within:border-line-strong">
          <label htmlFor="vera-question" className="sr-only">
            Your question about {dataset.filename}
          </label>
          <textarea
            id="vera-question"
            ref={boxRef}
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            autoFocus
            spellCheck={false}
            placeholder="Ask a question about this data"
            className="w-full resize-none bg-transparent px-5 pt-5 pb-2 text-body text-ink outline-none placeholder:text-ink-muted"
          />
          <div className="flex items-center justify-between gap-3 px-5 pb-4">
            <MicStatus mic={mic} idleHint="Enter to ask · Shift + Enter for a new line" />
            <div className="flex shrink-0 items-center gap-2">
              <MicButton mic={mic} reducedMotion={reducedMotion} />
              <button
                type="submit"
                disabled={!ready}
                aria-label="Ask Vera"
                className="grid size-9 place-items-center rounded-full bg-accent text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-muted disabled:hover:opacity-100"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </form>

      {suggestions.length > 0 && (
        <div className="v-reveal mt-6 flex flex-wrap gap-2" style={{ ["--step" as string]: 3 }}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onAsk(suggestion)}
              className="rounded-full border border-line bg-surface px-3.5 py-2 text-left text-small text-ink-muted transition-[color,border-color,background-color] duration-150 hover:border-line-strong hover:bg-sunk hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {prep.filename && (
        <PrepScreen
          filename={prep.filename}
          messages={prep.messages}
          report={prep.report}
          error={prep.error}
        />
      )}

      <div
        className="v-reveal mt-10 flex flex-wrap items-center gap-x-4 gap-y-3"
        style={{ ["--step" as string]: 4 }}
      >
        <p className="text-micro text-ink-muted">
          <span className="font-mono">{dataset.filename}</span> · {formatCount(dataset.rowCount)}{" "}
          rows · {dataset.columns.length} columns · {formatBytes(dataset.sizeBytes)}, held on the
          server
        </p>
        <UploadButton onFile={onFile} busy={prep.isPreparing} />
      </div>
      </div>
    </UploadDropzone>
  );
}
