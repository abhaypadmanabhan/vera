import { describe, expect, it, vi } from "vitest";
import {
  FIREWORKS_BASE_URL,
  FIREWORKS_MODEL_ID,
  FireworksError,
  createFireworksClient,
} from "@/lib/fireworks/client";

describe("Fireworks client", () => {
  it("pins the documented model and OpenAI-compatible base URL", () => {
    expect(FIREWORKS_BASE_URL).toBe("https://api.fireworks.ai/inference/v1");
    expect(FIREWORKS_MODEL_ID).toBe("accounts/fireworks/models/glm-5p2");
  });

  it("short-circuits mock mode before reading a key or making a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createFireworksClient({
      mockMode: true,
      apiKey: undefined,
      fetchImpl,
    });

    await expect(
      client.createChatCompletion({
        messages: [{ role: "user", content: "hello" }],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "test",
            schema: { type: "object" },
          },
        },
        maxTokens: 32,
      }),
    ).rejects.toMatchObject({ code: "mock_mode" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns content and token usage from a successful completion", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"code":"print(1)"}' }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        }),
        { status: 200 },
      ),
    );
    const client = createFireworksClient({
      mockMode: false,
      apiKey: "test-key",
      fetchImpl,
    });

    const result = await client.createChatCompletion({
      messages: [{ role: "user", content: "hello" }],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "test",
          schema: { type: "object" },
        },
      },
      maxTokens: 32,
    });

    expect(result).toEqual({
      content: '{"code":"print(1)"}',
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${FIREWORKS_BASE_URL}/chat/completions`,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("surfaces HTTP failures as typed errors", async () => {
    const client = createFireworksClient({
      mockMode: false,
      apiKey: "test-key",
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{"error":"busy"}', { status: 503 })),
    });

    await expect(
      client.createChatCompletion({
        messages: [{ role: "user", content: "hello" }],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "test",
            schema: { type: "object" },
          },
        },
        maxTokens: 32,
      }),
    ).rejects.toMatchObject({
      name: "FireworksError",
      code: "http_error",
      status: 503,
    } satisfies Partial<FireworksError>);
  });

  it("aborts a request at the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const client = createFireworksClient({
      mockMode: false,
      apiKey: "test-key",
      timeoutMs: 25,
      fetchImpl,
    });

    const pending = client.createChatCompletion({
      messages: [{ role: "user", content: "hello" }],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "test",
          schema: { type: "object" },
        },
      },
      maxTokens: 32,
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    vi.useRealTimers();
  });
});
