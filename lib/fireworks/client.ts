import { env } from "node:process";
import { z } from "zod";
import { MOCK_MODE } from "../config";

export const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";

/**
 * Verified literally in the Fireworks quickstart read on 2026-07-24:
 * https://docs.fireworks.ai/getting-started/quickstart
 * Keep model selection in this one server-side constant.
 */
export const FIREWORKS_MODEL_ID = "accounts/fireworks/models/glm-5p2";

export type FireworksErrorCode =
  | "mock_mode"
  | "missing_key"
  | "timeout"
  | "http_error"
  | "invalid_response"
  | "network_error";

export class FireworksError extends Error {
  readonly code: FireworksErrorCode;
  readonly status: number | null;

  constructor(
    code: FireworksErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "FireworksError";
    this.code = code;
    this.status = options.status ?? null;
  }
}

type JsonSchema = Record<string, unknown>;

export interface FireworksChatRequest {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  responseFormat: {
    type: "json_schema";
    json_schema: {
      name: string;
      schema: JsonSchema;
    };
  };
  maxTokens: number;
  signal?: AbortSignal;
}

export interface FireworksChatResult {
  content: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
}

export interface FireworksClient {
  createChatCompletion(request: FireworksChatRequest): Promise<FireworksChatResult>;
}

interface FireworksClientOptions {
  apiKey?: string;
  mockMode?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
        finish_reason: z.string(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function createFireworksClient(
  options: FireworksClientOptions = {},
): FireworksClient {
  const mockMode = options.mockMode ?? MOCK_MODE;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async createChatCompletion(
      request: FireworksChatRequest,
    ): Promise<FireworksChatResult> {
      if (mockMode) {
        throw new FireworksError(
          "mock_mode",
          "Fireworks is disabled while VERA_MOCK is enabled.",
        );
      }

      const apiKey = options.apiKey ?? env.FIREWORKS_API_KEY;
      if (!apiKey) {
        throw new FireworksError(
          "missing_key",
          "FIREWORKS_API_KEY is required for live code generation.",
        );
      }

      const timeoutController = new AbortController();
      const onExternalAbort = () => timeoutController.abort(request.signal?.reason);
      request.signal?.addEventListener("abort", onExternalAbort, { once: true });
      const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);

      try {
        const response = await fetchImpl(`${FIREWORKS_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: FIREWORKS_MODEL_ID,
            messages: request.messages,
            response_format: request.responseFormat,
            max_tokens: request.maxTokens,
          }),
          signal: timeoutController.signal,
        });

        if (!response.ok) {
          throw new FireworksError(
            "http_error",
            `Fireworks request failed with HTTP ${response.status}.`,
            { status: response.status },
          );
        }

        const body: unknown = await response.json();
        const parsed = completionSchema.safeParse(body);
        if (!parsed.success) {
          throw new FireworksError(
            "invalid_response",
            "Fireworks returned an invalid chat completion.",
            { cause: parsed.error },
          );
        }

        const choice = parsed.data.choices[0];
        const usage = parsed.data.usage;
        return {
          content: choice.message.content,
          finishReason: choice.finish_reason,
          usage: usage
            ? {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
              }
            : null,
        };
      } catch (error) {
        if (error instanceof FireworksError) throw error;
        if (isAbortError(error)) {
          throw new FireworksError(
            "timeout",
            `Fireworks request exceeded ${timeoutMs}ms.`,
            { cause: error },
          );
        }
        throw new FireworksError(
          "network_error",
          "Fireworks could not be reached.",
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", onExternalAbort);
      }
    },
  };
}
