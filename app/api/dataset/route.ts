import { Buffer } from "node:buffer";
import { z } from "zod";
import { LIMITS } from "@/lib/config";
import { resolveUpload, toSummary } from "@/lib/datasets";
import type { DatasetSummary } from "@/lib/types";

/**
 * Profiles an uploaded CSV and returns the client-safe `DatasetSummary`.
 *
 * The demo dataset never comes through here — the page is a server component and
 * reads it straight off disk. This route exists only so an upload gets the same
 * deterministic profile (column kinds, proven date formats, notes) as the demo,
 * without `lib/datasets.ts` or `lib/config.ts` ever entering the client bundle.
 *
 * Zero external calls: the profiler is local and deterministic (CLAUDE.md money rule).
 */

export const runtime = "nodejs";

const uploadSchema = z.object({
  filename: z.string().trim().min(1, "CSV filename is required."),
  content: z
    .string()
    .min(1, "That file is empty.")
    .refine(
      (content) => Buffer.byteLength(content, "utf8") <= LIMITS.maxCsvBytes,
      `CSV must be ${LIMITS.maxCsvBytes.toLocaleString()} bytes or smaller.`,
    ),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "That file could not be read." },
      { status: 400 },
    );
  }

  try {
    const summary: DatasetSummary = toSummary(resolveUpload(parsed.data));
    if (summary.columns.length === 0 || summary.rowCount === 0) {
      return Response.json(
        { error: "That file has no readable rows. Vera needs a header row and at least one row." },
        { status: 400 },
      );
    }
    return Response.json(summary);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "That file could not be profiled." },
      { status: 400 },
    );
  }
}
