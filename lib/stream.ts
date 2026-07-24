import type { StageEvent } from "./types";

/**
 * SSE codec shared by `/api/analyze` (server) and `useAnalysis` (client).
 * One `StageEvent` per SSE message, JSON-encoded on a single `data:` line.
 */

export function encodeEvent(event: StageEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function decodeEvent(raw: string): StageEvent | null {
  const line = raw
    .split("\n")
    .find((l) => l.startsWith("data:"))
    ?.slice(5)
    .trim();
  if (!line) return null;
  try {
    return JSON.parse(line) as StageEvent;
  } catch {
    return null;
  }
}

/** Splits a byte stream into complete SSE messages and yields decoded events. */
export async function* readEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StageEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = decodeEvent(chunk);
      if (event) yield event;
      boundary = buffer.indexOf("\n\n");
    }
  }
}
