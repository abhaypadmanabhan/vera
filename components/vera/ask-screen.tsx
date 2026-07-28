"use client";

import { useCallback, useRef } from "react";
import { ArrowRight, ArrowUp } from "lucide-react";
import type { DatasetSummary } from "@/lib/types";
import { HomeDatasetPanel } from "./home-dataset-panel";
import { MicButton, MicStatus } from "./mic-button";
import { PrepScreen } from "./prep-screen";
import { useMicrophone } from "./use-microphone";
import type { PrepState } from "./use-prep";
import { useReducedMotion } from "./use-reduced-motion";
import { UploadDropzone } from "./upload-dropzone";

/**
 * Screen 1 — Ask. An analyst being pointed at a file, not a chat box.
 *
 * Two columns: the question, and the file every question is answered about. The
 * box is still the primary action and keeps every behaviour it had — Enter
 * submits, Shift+Enter newlines, a suggested question runs on one click, the mic
 * appends into the box and never runs on its own, and a CSV can be dropped
 * anywhere on this surface. The file already on record stays askable while a new
 * one is being prepared.
 *
 * The suggested questions are an ordered offer — a numbered list on hairline
 * rules — rather than the ragged chip cloud that is the default AI-product shape.
 *
 * There is no explanatory lead under the question. DESIGN.md asks this screen to
 * "feel like it is waiting, not loading", and what Vera does with a question is
 * the landing page's job — repeating it here only makes the empty screen talk.
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
  /** Run this exact question now. Used by the list so one click is one run. */
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
      <div className="mx-auto my-auto w-full max-w-5xl px-6 py-8">
        {/*
         * Stretch, not `items-start`: the file column's rule is the divider
         * between the two columns, and a short panel would otherwise leave it
         * as a stub that stops halfway down the page.
         */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-14">
          <div>
            <h1
              className="v-reveal text-title text-balance text-ink"
              style={{ ["--step" as string]: 0 }}
            >
              What do you want to know?
            </h1>

            <form
              className="v-reveal mt-8"
              style={{ ["--step" as string]: 1 }}
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <div className="v-card relative shadow-lift transition-[border-color] duration-150 focus-within:border-line-strong">
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
                  placeholder="Ask about this data"
                  className="w-full resize-none bg-transparent px-5 pt-5 pb-2 text-body text-ink outline-none placeholder:text-ink-muted"
                />
                <div className="flex items-center justify-between gap-3 px-5 pb-4">
                  <MicStatus
                    mic={mic}
                    idleHint={
                      <>
                        Enter to ask
                        <span className="hidden sm:inline"> · Shift + Enter for a new line</span>
                      </>
                    }
                  />
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
              <section className="v-reveal mt-9" style={{ ["--step" as string]: 2 }}>
                <h2 className="v-label">Or start here</h2>
                <ol className="mt-3 border-t border-line">
                  {suggestions.map((suggestion, index) => (
                    <li key={`${index}-${suggestion}`} className="border-b border-line">
                      <button
                        type="button"
                        onClick={() => onAsk(suggestion)}
                        className="group flex w-full items-baseline gap-4 py-3.5 text-left"
                      >
                        <span className="v-marker shrink-0 tabular-nums">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 text-body text-ink-muted transition-colors duration-150 group-hover:text-ink group-focus-visible:text-ink">
                          {suggestion}
                        </span>
                        <ArrowRight
                          className="size-4 shrink-0 -translate-x-1 self-center text-ink-muted opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          <HomeDatasetPanel
            dataset={dataset}
            onFile={onFile}
            busy={prep.isPreparing}
            prep={
              prep.filename ? (
                <PrepScreen
                  filename={prep.filename}
                  messages={prep.messages}
                  report={prep.report}
                  error={prep.error}
                />
              ) : null
            }
          />
        </div>
      </div>
    </UploadDropzone>
  );
}
