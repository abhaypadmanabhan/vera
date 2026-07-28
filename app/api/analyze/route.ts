import { Buffer } from "node:buffer";
import { z } from "zod";
import { getAnalyst } from "@/lib/analyst";
import { LIMITS } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  contentHash,
  resolveDataset,
  resolveUpload,
} from "@/lib/datasets";
import { suggestFollowUps } from "@/lib/follow-ups";
import { getPrep } from "@/lib/prepare/store";
import { encodeEvent } from "@/lib/stream";
import { beginAnalysisTrace } from "@/lib/braintrust/logger";
import type {
  AnalysisRequest,
  Analyst,
  DatasetProfile,
  Finding,
  StageEvent,
} from "@/lib/types";

export const runtime = "nodejs";

/**
 * The schema the analyst can be PROVEN to have run against.
 *
 * `realAnalyst` re-profiles the prepared artifact when it can still read it and
 * silently falls back to the raw file and the raw profile when that artifact has
 * gone stale — a sandbox recycled between prep and analyze. The route cannot see
 * which branch was taken, and it used to hand `suggestFollowUps` the cached prep
 * profile either way. After a stale fallback that proposes questions about
 * columns prep INVENTED (an amount/unit split adds `duration_amount`, which the
 * raw file has never heard of), so the next run is either refused by the
 * guardrail or answered against a schema nobody meant.
 *
 * A verified finding's grounding columns were checked against the profile the
 * analyst actually used (`verifyGrounding`), which makes them the one piece of
 * evidence available here about which schema that was. If the prepared profile
 * cannot account for all of them it is demonstrably not the profile that ran, so
 * follow-ups come from the raw dataset profile — exactly what the analyst fell
 * back to.
 *
 * What this does NOT detect: two profiles with identical column NAMES that
 * differ only in inferred kind (a dirty text column prep turned into a number).
 * The grounding carries names, not kinds. Those suggestions stay phrased over
 * the same columns either way, so the follow-up is still answerable; it is the
 * structural drift that produces a refusal, and that is what this catches.
 */
function groundedProfile(
  finding: Finding,
  request: AnalysisRequest,
): DatasetProfile {
  const prepared = request.analysisProfile;
  if (!prepared || finding.verdict !== "verified") return request.dataset.profile;
  const preparedColumns = new Set(prepared.columns.map((column) => column.name));
  return finding.grounding.columns.every((column) => preparedColumns.has(column))
    ? prepared
    : request.dataset.profile;
}

/**
 * Run the asked question, then — only while `maxFindings` allows — the
 * follow-up questions Vera would have suggested anyway.
 *
 * The money shape of this (TASK.md, read twice): the DEFAULT is one question,
 * and with one question this iterable is exactly the old single
 * `analyst.run(request)` pass. Every finding beyond the first is its own
 * codegen + sandbox run, so the ceiling lives in one named config value
 * (`LIMITS.maxFindingsPerDeck`) and the builder turns it up only when he has
 * signed off on spend per deck. The HTTP rate limit and the per-process paid
 * run cap are untouched: one request is still one rate-limit token, and a
 * multi-finding deck can never spend more than `maxFindings` runs.
 *
 * The honesty shape: the asked question's outcome always streams, verified or
 * not (the refusal path is the product). A FOLLOW-UP that fails to verify is
 * simply absent — its finding event is swallowed here so the deck never
 * hedges, and the run stops rather than spending more on a broken thread.
 * Follow-up questions come from `suggestFollowUps`, which is free (no model
 * call), derived from the columns the executed code actually read, and already
 * filtered through the guardrail — the analyst then re-checks each one.
 *
 * The iterator is hand-built, NOT an async generator: an async generator
 * queues `return()` behind a pending inner `next()`, which would leave the
 * underlying analyst run hanging (and billing) after the client cancels. Here
 * `return()` propagates to the active inner iterator immediately — the same
 * prompt close the route has always relied on.
 */
export function runDeckQuestions(
  analyst: Analyst,
  request: AnalysisRequest,
  maxFindings: number,
): AsyncIterable<StageEvent> {
  const ceiling = Math.max(1, Math.floor(maxFindings));
  const asked = new Set([request.question.trim().toLowerCase()]);

  return {
    [Symbol.asyncIterator]() {
      let inner: AsyncIterator<StageEvent> | null = null;
      let current = request;
      let runs = 0;
      let isAskedQuestion = true;
      let finding: Finding | null = null;
      let finished = false;

      const finish = async (): Promise<IteratorResult<StageEvent>> => {
        finished = true;
        const active = inner;
        inner = null;
        if (active?.return) await active.return();
        return { done: true, value: undefined };
      };

      const next = async (): Promise<IteratorResult<StageEvent>> => {
        for (;;) {
          if (finished) return { done: true, value: undefined };

          if (!inner) {
            if (runs >= ceiling) return finish();
            isAskedQuestion = runs === 0;
            runs += 1;
            finding = null;
            inner = analyst.run(current)[Symbol.asyncIterator]();
          }

          const result = await inner.next();
          if (result.done) {
            inner = null;
            if (!finding || finding.verdict !== "verified") return finish();
            const nextQuestion = suggestFollowUps(
              finding,
              groundedProfile(finding, request),
            ).find((candidate) => !asked.has(candidate.trim().toLowerCase()));
            if (!nextQuestion) return finish();
            asked.add(nextQuestion.trim().toLowerCase());
            current = { ...request, question: nextQuestion };
            continue;
          }

          const event = result.value;
          if (event.type === "finding") {
            finding = event.finding;
            if (!isAskedQuestion && event.finding.verdict !== "verified") {
              // Absent, never presented: a failed follow-up leaves no finding
              // event behind for the deck to hedge over.
              continue;
            }
          }
          return { done: false, value: event };
        }
      };

      return {
        next,
        return: finish,
      };
    },
  };
}


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
    const prep = getPrep(contentHash(dataset.content));
    analysisRequest = {
      question: parsed.data.question,
      dataset,
      ...(prep?.ok && prep.analysisProfile
        ? {
            analysisPath: prep.analysisPath,
            analysisProfile: prep.analysisProfile,
          }
        : {}),
    };
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
          iterator ??= runDeckQuestions(
            getAnalyst(),
            analysisRequest,
            LIMITS.maxFindingsPerDeck,
          )[Symbol.asyncIterator]();
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
        // The trace records the ASKED question's finding; later finding events
        // belong to follow-up questions in the same deck.
        if (result.value.type === "finding" && finding === null) {
          finding = result.value.finding;
        }
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
