import { describe, expect, it, vi } from "vitest";

const telemetry = vi.hoisted(() => ({
  currentSpan: vi.fn(),
  end: vi.fn(),
  log: vi.fn(),
  startSpan: vi.fn(),
}));

vi.mock("braintrust", () => ({
  currentSpan: telemetry.currentSpan,
  traced: () => {
    throw new Error("Braintrust unavailable");
  },
}));

import { createFireworksClient } from "@/lib/fireworks/client";

describe("Fireworks telemetry isolation", () => {
  it("completes the model request when Braintrust span creation fails", async () => {
    telemetry.currentSpan.mockImplementationOnce(() => {
      throw new Error("Braintrust unavailable");
    });
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
    ).resolves.toMatchObject({
      content: '{"code":"print(1)"}',
      usage: { totalTokens: 14 },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("ends a created child span when its initial log fails", async () => {
    telemetry.log.mockImplementationOnce(() => {
      throw new Error("Log unavailable");
    });
    telemetry.startSpan.mockReturnValueOnce({
      end: telemetry.end,
      log: telemetry.log,
    });
    telemetry.currentSpan.mockReturnValueOnce({
      startSpan: telemetry.startSpan,
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        }),
        { status: 200 },
      ),
    );
    const client = createFireworksClient({
      mockMode: false,
      apiKey: "test-key",
      fetchImpl,
    });

    await expect(
      client.createChatCompletion({
        messages: [{ role: "user", content: "hello" }],
        responseFormat: {
          type: "json_schema",
          json_schema: { name: "test", schema: { type: "object" } },
        },
        maxTokens: 32,
      }),
    ).resolves.toMatchObject({ content: "ok" });
    expect(telemetry.end).toHaveBeenCalledOnce();
  });
});
