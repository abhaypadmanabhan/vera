import { describe, expect, it } from "vitest";
import { decodeEvent, encodeEvent, readEventStream } from "@/lib/stream";
import type { StageEvent } from "@/lib/types";

const stageEvent: StageEvent = {
  type: "stage",
  stage: "writing_code",
  status: "active",
  detail: "Reading input",
  attempt: 1,
  elapsedMs: 12,
};

const findingEvent: StageEvent = {
  type: "error",
  message: "Something failed",
  elapsedMs: 18,
};

describe("SSE codec", () => {
  it("round-trips a StageEvent through encode and decode", () => {
    expect(decodeEvent(encodeEvent(stageEvent))).toEqual(stageEvent);
  });

  it("reassembles events split across byte chunk boundaries", async () => {
    const encoded = `${encodeEvent(stageEvent)}${encodeEvent(findingEvent)}`;
    const bytes = new TextEncoder().encode(encoded);
    const splitPoints = [3, 17, bytes.length - 5];
    const chunks = [
      bytes.slice(0, splitPoints[0]),
      bytes.slice(splitPoints[0], splitPoints[1]),
      bytes.slice(splitPoints[1], splitPoints[2]),
      bytes.slice(splitPoints[2]),
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    });

    const events: StageEvent[] = [];
    for await (const event of readEventStream(body)) events.push(event);

    expect(events).toEqual([stageEvent, findingEvent]);
  });
});
