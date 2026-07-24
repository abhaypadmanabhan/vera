import { Fragment } from "react";
import { cn } from "@/lib/utils";

/**
 * The code that ran, rendered exactly as it was executed — never reformatted
 * between run and display (see `GeneratedCode.source`).
 *
 * Highlighting is deliberately two-tone: mint for keywords, a neutral ramp for
 * everything else. A rainbow theme would break the colour budget in DESIGN.md
 * and, in a card whose whole job is to look like evidence, read as decoration.
 */

type TokenKind = "plain" | "comment" | "string" | "keyword" | "number";

const KEYWORDS =
  "import|from|as|def|return|if|elif|else|for|while|in|not|and|or|None|True|False|lambda|with|try|except|finally|raise|class|is|pass|assert|global|yield";

const TOKENIZER = new RegExp(
  [
    "(#[^\\n]*)",
    "([rbfu]{0,2}(?:\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?'''|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'))",
    `\\b(${KEYWORDS})\\b`,
    "(\\b\\d+(?:\\.\\d+)?\\b)",
  ].join("|"),
  "g",
);

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "text-foreground/80",
  comment: "text-muted-foreground",
  string: "text-foreground/60",
  keyword: "text-primary",
  number: "text-foreground",
};

interface Token {
  kind: TokenKind;
  text: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  TOKENIZER.lastIndex = 0;
  let match = TOKENIZER.exec(source);
  while (match !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: "plain", text: source.slice(cursor, match.index) });
    }
    const kind: TokenKind = match[1]
      ? "comment"
      : match[2]
        ? "string"
        : match[3]
          ? "keyword"
          : "number";
    tokens.push({ kind, text: match[0] });
    cursor = match.index + match[0].length;
    match = TOKENIZER.exec(source);
  }

  if (cursor < source.length) tokens.push({ kind: "plain", text: source.slice(cursor) });
  return tokens;
}

export function CodeBlock({
  source,
  label,
  className,
}: {
  source: string;
  /** Read by screen readers in place of the gutter numbers. */
  label: string;
  className?: string;
}) {
  const tokens = tokenize(source);
  const lineCount = source.split("\n").length;
  const gutterWidth = `${String(lineCount).length}ch`;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-raised ring-1 ring-border",
        className,
      )}
    >
      <div className="max-h-80 overflow-auto">
        <div className="flex min-w-max">
          <div
            aria-hidden
            className="vera-nums sticky left-0 shrink-0 border-r border-border bg-surface-raised px-3 py-3 text-right font-mono text-xs leading-5 text-muted-foreground/60 select-none"
            style={{ width: `calc(${gutterWidth} + 1.5rem)` }}
          >
            {Array.from({ length: lineCount }, (_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>
          <pre
            aria-label={label}
            className="px-4 py-3 font-mono text-xs leading-5 whitespace-pre"
          >
            <code>
              {tokens.map((token, index) => (
                <Fragment key={index}>
                  <span className={TOKEN_CLASS[token.kind]}>{token.text}</span>
                </Fragment>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
