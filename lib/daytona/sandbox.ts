import { Daytona, DaytonaError, type Sandbox } from "@daytona/sdk";
import { LIMITS, MOCK_MODE } from "../config";
import type { CodeExecutor } from "../codegen/retry";
import type { ExecutionResult } from "../types";

/**
 * SERVER ONLY. Daytona sandbox executor (PRD §4.3, §7).
 *
 * One warm sandbox, created on first use and reused across requests. Nothing here
 * runs at import time — constructing this module costs nothing, and `MOCK_MODE`
 * hard-blocks every entry point, so the mocked build can never touch the API.
 *
 * Landmines from `docs/phase23-research.md`, all handled below:
 *   - `ExecuteResponse` has NO `stderr` field. `result` is combined output; branch
 *     on `exitCode` and treat `result` as the error text when it is non-zero.
 *   - `executeCommand` defaults to a 10-SECOND timeout and its timeout argument is
 *     in seconds, not milliseconds. Always pass one explicitly.
 *   - The SDK opens a websocket per client, so build ONE client per process.
 *   - pandas ships in the default snapshot; no custom image is needed.
 */

const SANDBOX_LABEL = { app: "vera" } as const;
export const SANDBOX_CSV_PATH = "/home/daytona/data.csv";

/** The result contract with the generated code. Anything else is treated as no value. */
const RESULT_PREFIX = "VERA_RESULT:";

interface WarmState {
  client: Daytona | null;
  sandbox: Sandbox | null;
  /** Which dataset's bytes are currently sitting in the sandbox. */
  loadedDatasetId: string | null;
  createdAtMs: number | null;
}

/** Survive Next dev hot-reload, which re-evaluates modules but keeps globalThis. */
const STATE_KEY = Symbol.for("vera.daytona.warm");
const globalState = globalThis as unknown as Record<symbol, WarmState | undefined>;

function state(): WarmState {
  globalState[STATE_KEY] ??= {
    client: null,
    sandbox: null,
    loadedDatasetId: null,
    createdAtMs: null,
  };
  return globalState[STATE_KEY];
}

function assertLive(): void {
  if (MOCK_MODE) {
    throw new Error(
      "Daytona was called while MOCK_MODE is on. This is a bug — mock mode must never reach the sandbox.",
    );
  }
}

function client(): Daytona {
  assertLive();
  const s = state();
  if (s.client) return s.client;
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) throw new Error("DAYTONA_API_KEY is not set.");
  s.client = new Daytona({ apiKey });
  return s.client;
}

export interface WarmSandboxInfo {
  sandboxId: string;
  reused: boolean;
  readyMs: number;
}

/**
 * Get the warm sandbox, creating it once. If a previously held handle has died or
 * expired, recreate it once rather than failing the run (PRD §4.3).
 */
export async function getWarmSandbox(): Promise<WarmSandboxInfo> {
  assertLive();
  const s = state();
  const startedAt = Date.now();

  if (s.sandbox) {
    try {
      // Cheap liveness probe; also confirms the handle still resolves.
      await s.sandbox.process.executeCommand("true", undefined, undefined, 10);
      return { sandboxId: s.sandbox.id, reused: true, readyMs: Date.now() - startedAt };
    } catch {
      // Dead or expired — fall through and recreate.
      s.sandbox = null;
      s.loadedDatasetId = null;
    }
  }

  const sandbox = await client().create({
    labels: { ...SANDBOX_LABEL },
    // pandas is preinstalled in the default python snapshot — no custom image.
    autoStopInterval: 30,
  });
  s.sandbox = sandbox;
  s.createdAtMs = Date.now();
  s.loadedDatasetId = null;
  return { sandboxId: sandbox.id, reused: false, readyMs: Date.now() - startedAt };
}

/** Write the dataset in once per sandbox lifetime, not once per question. */
export async function ensureDatasetLoaded(
  datasetId: string,
  content: string,
): Promise<{ uploaded: boolean; bytes: number }> {
  assertLive();
  const s = state();
  await getWarmSandbox();
  if (!s.sandbox) throw new Error("Sandbox unavailable after warm-up.");
  const bytes = Buffer.byteLength(content, "utf8");
  if (s.loadedDatasetId === datasetId) return { uploaded: false, bytes };
  await s.sandbox.fs.uploadFile(Buffer.from(content, "utf8"), SANDBOX_CSV_PATH);
  s.loadedDatasetId = datasetId;
  return { uploaded: true, bytes };
}

/**
 * Accept a bare scalar, or a single-entry object/array wrapping one.
 *
 * The prompt asks for a bare value, but models like to label their answer
 * (`{"total_sales_q3_2018": 143787.36}`). A one-entry wrapper is unambiguous, so
 * unwrap it. More than one entry IS ambiguous — which of them is the answer? —
 * so it returns null and the run blocks rather than guessing.
 */
function coerceValue(parsed: unknown): number | string | null {
  if (typeof parsed === "number") return Number.isFinite(parsed) ? parsed : null;
  if (typeof parsed === "string") return parsed.trim() === "" ? null : parsed;
  if (Array.isArray(parsed)) return parsed.length === 1 ? coerceValue(parsed[0]) : null;
  if (parsed !== null && typeof parsed === "object") {
    const values = Object.values(parsed as Record<string, unknown>);
    return values.length === 1 ? coerceValue(values[0]) : null;
  }
  return null;
}

const MAX_CONTEXT_FIGURES = 3;

export interface ResultPayload {
  value: number | string | null;
  /** Raw executed context values, keyed by name. Empty when none. */
  contextValues: Record<string, number | string>;
}

function isEnvelope(parsed: unknown): parsed is { value: unknown; context?: unknown } {
  return (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "value" in parsed
  );
}

/** A context figure is held to the same bar as the primary value: usable, or gone. */
function coerceContext(raw: unknown): Record<string, number | string> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number | string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_CONTEXT_FIGURES) break;
    if (typeof value === "number") {
      if (Number.isFinite(value)) out[name] = value;
      continue;
    }
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    if (/^(nan|-?inf(inity)?|none|null|na|n\/a)$/i.test(trimmed)) continue;
    out[name] = trimmed;
  }
  return out;
}

export function parseResultPayload(output: string): ResultPayload {
  const line = output
    .split("\n")
    .reverse()
    .find((candidate) => candidate.trim().startsWith(RESULT_PREFIX));
  if (!line) return { value: null, contextValues: {} };
  const raw = line.trim().slice(RESULT_PREFIX.length).trim();
  if (raw === "") return { value: null, contextValues: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { value: parseResultValue(output), contextValues: {} };
  }

  if (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "context" in parsed &&
    !("value" in parsed)
  ) {
    return { value: null, contextValues: {} };
  }
  if (isEnvelope(parsed)) {
    return {
      value: coerceValue(parsed.value),
      contextValues: coerceContext(parsed.context),
    };
  }
  return { value: parseResultValue(output), contextValues: {} };
}

/** Pull the single machine-readable value the generated code is required to print. */
export function parseResultValue(output: string): number | string | null {
  const line = output
    .split("\n")
    .reverse()
    .find((l) => l.trim().startsWith(RESULT_PREFIX));
  if (!line) return null;
  const raw = line.trim().slice(RESULT_PREFIX.length).trim();
  if (raw === "") return null;

  // Python's non-answers. These must BLOCK, not render as a figure (PRD §4.4).
  if (/^(nan|-?inf(inity)?|none|null|na|n\/a)$/i.test(raw)) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isEnvelope(parsed)) return coerceValue(parsed.value);
    return coerceValue(parsed);
  } catch {
    const asNumber = Number(raw);
    return Number.isFinite(asNumber) ? asNumber : raw;
  }
}

export const daytonaExecutor: CodeExecutor = {
  async execute({ code, timeoutMs, signal }): Promise<ExecutionResult> {
    assertLive();
    const s = state();
    await getWarmSandbox();
    if (!s.sandbox) throw new Error("Sandbox unavailable.");
    if (signal.aborted) throw new Error("Aborted before execution.");

    const startedAt = Date.now();
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1_000));

    try {
      const response = await s.sandbox.process.codeRun(code, undefined, timeoutSeconds);
      const output = response.result ?? "";
      const exitCode = response.exitCode ?? 0;
      const payload =
        exitCode === 0
          ? parseResultPayload(output)
          : { value: null, contextValues: {} };
      return {
        exitCode,
        // There is no stderr field. On failure `result` IS the error text.
        stdout: exitCode === 0 ? output : "",
        stderr: exitCode === 0 ? "" : output,
        value: payload.value,
        contextValues: payload.contextValues,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message =
        error instanceof DaytonaError || error instanceof Error
          ? error.message
          : "Sandbox execution failed.";
      return {
        exitCode: 1,
        stdout: "",
        stderr: message,
        value: null,
        contextValues: {},
        durationMs: Date.now() - startedAt,
      };
    }
  },
};

/** Explicit teardown so no sandbox is left burning credits after the demo. */
export async function teardownSandbox(): Promise<string | null> {
  const s = state();
  if (!s.sandbox) return null;
  const id = s.sandbox.id;
  await s.sandbox.delete(60);
  s.sandbox = null;
  s.loadedDatasetId = null;
  s.createdAtMs = null;
  return id;
}

export const SANDBOX_EXECUTION_TIMEOUT_MS = LIMITS.executionTimeoutMs;
