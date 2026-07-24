import { readFile } from "node:fs/promises";
import path from "node:path";
import { profileDataset } from "./profile/profiler";
import { parseCsv } from "./csv";
import type { CsvPayload, DatasetSummary, ResolvedDataset } from "./types";

/**
 * SERVER ONLY. Never import this from a client component.
 *
 * The demo CSV is 2.3 MB and lives on disk. It never crosses the wire: the browser
 * sends a `datasetId`, the server reads and profiles the file, and the client
 * receives only a `DatasetSummary` (schema + a preview slice).
 */

export const DEFAULT_DATASET_ID = "superstore";

interface DatasetSource {
  id: string;
  filename: string;
  /** Path relative to the repo root. */
  file: string;
  label: string;
  description: string;
}

const SOURCES: Record<string, DatasetSource> = {
  superstore: {
    id: "superstore",
    filename: "superstore.csv",
    file: "data/superstore.csv",
    label: "Superstore orders",
    description: "9,994 retail orders, 2016-2019, 22 columns.",
  },
};

/** Profiling 9,994 rows on every request would be wasteful — do it once per process. */
const cache = new Map<string, ResolvedDataset>();

export async function resolveDataset(datasetId: string): Promise<ResolvedDataset> {
  const cached = cache.get(datasetId);
  if (cached) return cached;

  const source = SOURCES[datasetId];
  if (!source) throw new Error(`Unknown dataset: ${datasetId}`);

  const content = await readFile(path.join(process.cwd(), source.file), "utf8");
  const resolved: ResolvedDataset = {
    id: source.id,
    filename: source.filename,
    content,
    profile: profileDataset(source.id, source.filename, content),
  };
  cache.set(datasetId, resolved);
  return resolved;
}

/** Wrap a user upload in the same shape, so the analyst cannot tell the difference. */
export function resolveUpload(upload: CsvPayload): ResolvedDataset {
  return {
    id: "upload",
    filename: upload.filename,
    content: upload.content,
    profile: profileDataset("upload", upload.filename, upload.content),
  };
}

/** The only projection of a dataset the client is allowed to see. */
export function toSummary(dataset: ResolvedDataset, previewRows = 8): DatasetSummary {
  const rows = parseCsv(dataset.content);
  return {
    id: dataset.id,
    filename: dataset.filename,
    rowCount: dataset.profile.rowCount,
    columns: dataset.profile.columns,
    duplicateRowCount: dataset.profile.duplicateRowCount,
    notes: dataset.profile.notes,
    previewRows: rows.slice(1, previewRows + 1),
    sizeBytes: Buffer.byteLength(dataset.content, "utf8"),
  };
}

export function listDatasets(): DatasetSource[] {
  return Object.values(SOURCES);
}
