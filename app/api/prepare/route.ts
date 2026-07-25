import { Buffer } from "node:buffer";
import { z } from "zod";
import { LIMITS } from "@/lib/config";
import {
  contentHash,
  resolveUpload,
  toSummary,
} from "@/lib/datasets";
import {
  prepareDataset,
  type PrepProgressEvent,
  type PrepReport,
} from "@/lib/prepare/run";
import { getPrep, setPrep } from "@/lib/prepare/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseCsv } from "@/lib/csv";
import { encodeEvent } from "@/lib/stream";
import type {
  CsvPayload,
  DatasetSummary,
  ResolvedDataset,
  StageEvent,
} from "@/lib/types";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    upload: z
      .object({
        filename: z.string().trim().min(1, "CSV filename is required."),
        content: z
          .string()
          .min(1, "That file is empty.")
          .refine(
            (content) =>
              Buffer.byteLength(content, "utf8") <= LIMITS.maxCsvBytes,
            `CSV must be ${LIMITS.maxCsvBytes.toLocaleString()} bytes or smaller.`,
          ),
      })
      .strict(),
  })
  .strict();

type PrepStage = "profiling" | "cleaning" | "checking" | "ready";

interface PrepStageEvent {
  type: "prep-stage";
  stage: PrepStage;
  status: "active" | "complete" | "failed";
  detail: string;
}

interface PrepReportEvent {
  type: "prep-report";
  summary: DatasetSummary;
  report: PrepReport;
}

type PrepEvent = PrepStageEvent | PrepReportEvent;

type PrepProgressListener = (event: PrepProgressEvent) => void;

interface PrepProgressChannel {
  progress: PrepProgressEvent[];
  listeners: Set<PrepProgressListener>;
}

interface InFlightPrep extends PrepProgressChannel {
  promise: Promise<PrepReport>;
}

const inFlightPrep = new Map<string, InFlightPrep>();

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

function encodePrepEvent(event: PrepEvent): string {
  return encodeEvent(event as unknown as StageEvent);
}

function deliverProgress(
  listener: PrepProgressListener,
  event: PrepProgressEvent,
): void {
  try {
    listener(event);
  } catch {
    // One disconnected stream must not interrupt shared prep or other clients.
  }
}

function publishProgress(
  channel: PrepProgressChannel,
  event: PrepProgressEvent,
): void {
  channel.progress.push(event);
  for (const listener of channel.listeners) {
    deliverProgress(listener, event);
  }
}

async function followPreparation(
  entry: InFlightPrep,
  listener: PrepProgressListener,
): Promise<PrepReport> {
  for (const event of entry.progress) {
    deliverProgress(listener, event);
  }
  entry.listeners.add(listener);
  try {
    return await entry.promise;
  } finally {
    entry.listeners.delete(listener);
  }
}

function startPreparation(
  dataset: ResolvedDataset,
  hash: string,
): InFlightPrep {
  const channel: PrepProgressChannel = {
    progress: [],
    listeners: new Set(),
  };
  const work = new Promise<PrepReport>((resolve, reject) => {
    queueMicrotask(() => {
      void (async (): Promise<PrepReport> => {
        const cachedAtExecution = getPrep(hash);
        if (cachedAtExecution) return cachedAtExecution;

        const report = await prepareDataset(dataset, {
          onProgress(event) {
            publishProgress(channel, event);
          },
        });
        setPrep(hash, report);
        return report;
      })().then(resolve, reject);
    });
  });
  const entry: InFlightPrep = {
    promise: work,
    ...channel,
  };
  inFlightPrep.set(hash, entry);
  const removeEntry = (): void => {
    if (inFlightPrep.get(hash) === entry) {
      inFlightPrep.delete(hash);
    }
  };
  void work.then(removeEntry, removeEntry);
  return entry;
}

async function prepareShared(
  dataset: ResolvedDataset,
  hash: string,
  onProgress: (event: PrepProgressEvent) => void,
): Promise<PrepReport> {
  const persisted = getPrep(hash);
  if (persisted) return persisted;

  const entry = inFlightPrep.get(hash) ?? startPreparation(dataset, hash);
  return followPreparation(entry, onProgress);
}

function streamResponse(
  upload: CsvPayload,
  hash: string,
  cached?: {
    summary: DatasetSummary;
    report: PrepReport;
  },
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PrepEvent): void => {
        controller.enqueue(encoder.encode(encodePrepEvent(event)));
      };

      if (cached) {
        send({
          type: "prep-stage",
          stage: "ready",
          status: "complete",
          detail: "This file is ready for analysis.",
        });
        send({
          type: "prep-report",
          summary: cached.summary,
          report: cached.report,
        });
        controller.close();
        return;
      }

      send({
        type: "prep-stage",
        stage: "profiling",
        status: "active",
        detail: "Reading every row and checking the shape of this file.",
      });
      const dataset = resolveUpload(upload);
      const summary = toSummary(dataset);
      send({
        type: "prep-stage",
        stage: "profiling",
        status: "complete",
        detail: "Read every row and checked the shape of this file.",
      });

      const report = await prepareShared(
        dataset,
        hash,
        (event) => send({ type: "prep-stage", ...event }),
      );
      send({
        type: "prep-stage",
        stage: "ready",
        status: "complete",
        detail:
          report.detail ?? "This file is ready for analysis.",
      });
      send({ type: "prep-report", summary, report });
      controller.close();
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

export async function POST(request: Request): Promise<Response> {
  const rateLimit = checkRateLimit(clientIp(request));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many prepare requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1_000)),
          ),
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
    return badRequest(
      parsed.error.issues[0]?.message ?? "That file could not be read.",
    );
  }

  try {
    const rows = parseCsv(parsed.data.upload.content);
    if ((rows[0]?.length ?? 0) === 0 || rows.length < 2) {
      return badRequest(
        "That file has no readable rows. Vera needs a header row and at least one row.",
      );
    }
    const hash = contentHash(parsed.data.upload.content);
    const cachedReport = getPrep(hash);
    if (!cachedReport) {
      return streamResponse(parsed.data.upload, hash);
    }

    const dataset = resolveUpload(parsed.data.upload);
    return streamResponse(parsed.data.upload, hash, {
      summary: toSummary(dataset),
      report: cachedReport,
    });
  } catch (error) {
    return badRequest(
      error instanceof Error
        ? error.message
        : "That file could not be profiled.",
    );
  }
}
