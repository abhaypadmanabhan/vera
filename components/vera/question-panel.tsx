"use client";

import { useId } from "react";
import { CornerDownLeft, MessageSquareText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Panel, SectionLabel } from "./panel";

/**
 * The question half of the input rail (issue #4).
 *
 * One primary action per screen, and it is this one. Examples submit on a
 * single click — on stage that is the whole interaction.
 */
export function QuestionPanel({
  value,
  examples,
  isRunning,
  onChange,
  onSubmit,
}: {
  value: string;
  examples: string[];
  isRunning: boolean;
  onChange: (question: string) => void;
  onSubmit: (question: string) => void;
}) {
  const fieldId = useId();
  const hintId = useId();
  const canSubmit = value.trim().length > 0 && !isRunning;

  return (
    <Panel>
      <CardHeader>
        <SectionLabel icon={<MessageSquareText className="size-3.5" aria-hidden />}>
          Question
        </SectionLabel>
      </CardHeader>

      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit(value.trim());
          }}
        >
          <div className="space-y-2">
            <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
              Ask a question about this data
            </label>
            <Textarea
              id={fieldId}
              value={value}
              aria-describedby={hintId}
              disabled={isRunning}
              rows={2}
              placeholder="What was gross margin in Q3 2025?"
              className="min-h-20 resize-none bg-surface-raised text-sm placeholder:text-muted-foreground/70"
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                if (canSubmit) onSubmit(value.trim());
              }}
            />
            <p id={hintId} className="text-xs text-muted-foreground">
              Enter to run, Shift + Enter for a new line. Vera answers from code she runs on this
              file, never from memory.
            </p>
          </div>

          <Button type="submit" size="lg" disabled={!canSubmit} className="w-full">
            {isRunning ? (
              <>
                <span
                  aria-hidden
                  className="vera-pulse size-1.5 rounded-full bg-primary-foreground"
                  data-icon="inline-start"
                />
                Analyzing
              </>
            ) : (
              <>
                Analyze
                <CornerDownLeft data-icon="inline-end" aria-hidden />
              </>
            )}
          </Button>
        </form>

        <div className="space-y-2">
          <SectionLabel className="text-[0.6875rem]" icon={<Sparkles className="size-3" aria-hidden />}>
            Try one
          </SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {examples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => {
                    onChange(example);
                    onSubmit(example);
                  }}
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:bg-surface-raised hover:text-foreground focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Panel>
  );
}
