import { Buffer } from "node:buffer";
import { z } from "zod";
import { getAnalyst } from "@/lib/analyst";
import { LIMITS } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveDataset, resolveUpload } from "@/lib/datasets";
import { encodeEvent } from "@/lib/stream";
import { beginAnalysisTrace } from "@/lib/braintrust/logger";
import type { AnalysisRequest, Finding, StageEvent } from "@/lib/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Question is required.")
    .max(
      LIMITS.maxQuestionLength,
      `Question must be ${LIMITS.maxQuestionLength} characters or fewer.`,
    ),
  datasetId: z.string().min(1, "A dataset is required."),
  // Only present when the user uploaded their own file. The 2.3 MB demo CSV lives
  // on the server and never crosses the wire.
  upload: z
    .object({
      filename: z.string().min(1, "CSV filename is required."),
      content: z.string().refine(
        (content) => Buffer.byteLength(content, "utf8") <= LIMITS.maxCsvBytes,
        `CSV must be ${LIMITS.maxCsvBytes} bytes or smaller.`,
      ),
    })
    .optional(),
});

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = checkRateLimit(clientIp(request));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many analysis requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1_000))),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid analysis request.");
  }

  let analysisRequest: AnalysisRequest;
  try {
    const dataset = parsed.data.upload
      ? resolveUpload(parsed.data.upload)
      : await resolveDataset(parsed.data.datasetId);
    analysisRequest = { question: parsed.data.question, dataset };
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "That dataset could not be loaded.",
    );
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const abortedResult = Symbol("aborted");
  let resolveAbort = (): void => undefined;
  const abortPromise = new Promise<typeof abortedResult>((resolve) => {
    resolveAbort = () => resolve(abortedResult);
  });
  let iterator: AsyncIterator<StageEvent> | null = null;
  let aborted = false;
  let iteratorClosed = false;
  let pendingNext: Promise<IteratorResult<StageEvent>> | null = null;
  let iteratorClose: Promise<void> | null = null;
  let abortFinalization: Promise<void> | null = null;

  // Braintrust Logs: one trace per real run, written once the stream settles.
  // Normal completion allows a bounded flush; telemetry failure never fails it.
  let finding: Finding | null = null;
  let traced = false;
  const analysisTrace = beginAnalysisTrace({
    question: analysisRequest.question,
    datasetId: parsed.data.datasetId,
  });
  const trace = async (error?: string): Promise<void> => {
    if (traced) return;
    traced = true;
    await analysisTrace.finish({
      finding,
      error,
      durationMs: Date.now() - startedAt,
    });
  };

  const closeIterator = (): Promise<void> => {
    if (iteratorClose) return iteratorClose;
    if (iteratorClosed || !iterator) return Promise.resolve();
    iteratorClosed = true;
    iteratorClose = (async () => {
      try {
        await iterator?.return?.();
      } catch {
        // Cleanup errors cannot be delivered after the response has been cancelled.
      }
    })();
    return iteratorClose;
  };
  const finishAbortedTrace = (error: string): Promise<void> => {
    abortFinalization ??= (async () => {
      const inFlight = pendingNext;
      const workSettled = Promise.all([
        closeIterator(),
        inFlight?.then(
          () => undefined,
          () => undefined,
        ) ?? Promise.resolve(),
      ]);
      let settleTimeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        workSettled,
        new Promise<void>((resolve) => {
          settleTimeout = setTimeout(resolve, LIMITS.runBudgetMs);
        }),
      ]);
      if (settleTimeout) clearTimeout(settleTimeout);
      await trace(error);
    })();
    return abortFinalization;
  };
  const onAbort = (): void => {
    aborted = true;
    resolveAbort();
    void finishAbortedTrace("Analysis aborted.");
  };
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) onAbort();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (aborted) {
        controller.close();
        request.signal.removeEventListener("abort", onAbort);
        return;
      }

      try {
        const next = analysisTrace.run(() => {
          iterator ??= getAnalyst().run(analysisRequest)[Symbol.asyncIterator]();
          return iterator.next();
        });
        pendingNext = next;
        void next.then(
          () => {
            if (pendingNext === next) pendingNext = null;
          },
          () => {
            if (pendingNext === next) pendingNext = null;
          },
        );
        const result = await Promise.race([next, abortPromise]);
        if (result === abortedResult || aborted) {
          controller.close();
          request.signal.removeEventListener("abort", onAbort);
          void finishAbortedTrace("Analysis aborted.");
          return;
        }
        if (result.done) {
          iteratorClosed = true;
          await trace();
          controller.close();
          request.signal.removeEventListener("abort", onAbort);
          return;
        }
        if (result.value.type === "finding") finding = result.value.finding;
        controller.enqueue(encoder.encode(encodeEvent(result.value)));
      } catch (error) {
        if (!aborted) {
          const event: StageEvent = {
            type: "error",
            message: error instanceof Error ? error.message : "Analysis failed.",
            elapsedMs: Date.now() - startedAt,
          };
          await trace(event.message);
          controller.enqueue(encoder.encode(encodeEvent(event)));
        }
        controller.close();
        request.signal.removeEventListener("abort", onAbort);
        await closeIterator();
      }
    },
    cancel() {
      aborted = true;
      resolveAbort();
      request.signal.removeEventListener("abort", onAbort);
      void finishAbortedTrace("Analysis cancelled.");
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
