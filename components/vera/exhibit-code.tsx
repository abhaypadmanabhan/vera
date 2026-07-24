import { Exhibit } from "./exhibit";
import type { GeneratedCode } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Exhibit A — the code that ran.
 *
 * Rendered byte-for-byte as it was executed; never reformatted between run and
 * display. The line that uses a date format Vera *proved* from the data gets the
 * red pen, because that single line is the difference between a right answer and
 * a wrong-but-clean one (tasks/checkpoints.md CP-2).
 */
export function ExhibitCode({
  code,
  provenFormats,
  note,
}: {
  code: GeneratedCode;
  /** strftime formats the profiler proved for this file, e.g. `%d/%m/%Y`. */
  provenFormats: string[];
  note?: string;
}) {
  const lines = code.source.split("\n");
  const isMarked = (line: string) =>
    provenFormats.length > 0 && provenFormats.some((format) => line.includes(format));
  const markedCount = lines.filter(isMarked).length;

  return (
    <Exhibit letter="A" title="The code that ran" note={note}>
      <div tabIndex={0} role="region" aria-label="The executed source, scrolls sideways" className="overflow-x-auto">
        <pre className="w-max min-w-full py-4 font-mono text-meta">
          <code>
            {lines.map((line, index) => (
              <span key={index} className="flex">
                <span
                  aria-hidden
                  className="w-12 shrink-0 select-none pr-4 text-right text-note text-ink-muted"
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "flex-1 whitespace-pre pr-6",
                    isMarked(line) && "v-marked pl-1 -ml-1",
                  )}
                >
                  {line === "" ? " " : line}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </div>
      <div className="space-y-1 border-t border-rule px-4 py-3">
        <p className="font-serif text-body">{code.explanation}</p>
        {markedCount > 0 ? (
          <p className="v-label">
            <span aria-hidden>↳ </span>
            Marked in red: the date format proven from your data, not assumed. Exhibit C shows the
            count behind it.
          </p>
        ) : null}
      </div>
    </Exhibit>
  );
}
