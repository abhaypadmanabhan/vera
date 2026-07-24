"use client";

import { useId } from "react";
import type { FormEvent } from "react";

/**
 * The question, written on a ruled line — not typed into a box. The rule turns
 * red on focus; the submit is text with a red underline that thickens, never a
 * filled pill (DESIGN.md "Components").
 */
export function Ask({
  value,
  onChange,
  onSubmit,
  isRunning,
  examples,
  failExample,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (question: string) => void;
  isRunning: boolean;
  examples: string[];
  /** The demo's refusal path — asks Vera something the run cannot finish. */
  failExample: string;
}) {
  const inputId = useId();
  const trimmed = value.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || isRunning) return;
    onSubmit(trimmed);
  };

  return (
    <section>
      <form onSubmit={submit}>
        <label htmlFor={inputId} className="v-label">
          Put a question to Vera
        </label>
        {/* The rule turns red the instant focus lands — a focus indicator never fades in. */}
        <div className="mt-3 flex items-end gap-6 border-b border-ink pb-2 focus-within:border-b-2 focus-within:border-mark focus-within:pb-[7px]">
          <input
            id={inputId}
            name="question"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={isRunning}
            autoComplete="off"
            placeholder="Which sub-category lost the most money?"
            className="min-w-0 flex-1 bg-transparent font-serif text-claim tracking-[-0.02em] outline-none placeholder:text-ink-muted placeholder:italic disabled:text-ink-muted"
          />
          <button
            type="submit"
            disabled={!trimmed || isRunning}
            className="v-pen v-label shrink-0 pb-1 text-ink disabled:cursor-not-allowed"
          >
            {isRunning ? "Running" : "Ask Vera"}
          </button>
        </div>
      </form>

      <ul className="mt-4 flex flex-col gap-1.5">
        {examples.map((example) => (
          <li key={example}>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => {
                onChange(example);
                onSubmit(example);
              }}
              className="text-left font-mono text-note text-ink-muted transition-[color] duration-150 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span aria-hidden>↳ </span>
              {example}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            disabled={isRunning}
            onClick={() => {
              onChange(failExample);
              onSubmit(failExample);
            }}
            className="text-left font-mono text-note text-mark-ink transition-[color] duration-150 hover:text-mark disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden>↳ </span>
            Make this run fail, to see what Vera does with a number she cannot trace
          </button>
        </li>
      </ul>
    </section>
  );
}
