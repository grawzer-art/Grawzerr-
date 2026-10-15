import { describe, expect, it, vi } from "vitest";

import { OpenAiCompatibleProvider } from "@/lib/ai/openai-compatible";
import { ProviderError } from "@/lib/ai/types";

import { collect, streamOf } from "./helpers";

const chunk = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

function provider(fetchImpl: typeof fetch, opts: Partial<{ maxTokensParam: "max_tokens" | "max_completion_tokens"; streamUsage: boolean }> = {}) {
  return new OpenAiCompatibleProvider({
    id: "gemini",
    baseUrl: "https://example.test/v1/",
    apiKey: "secret",
    model: "m",
    maxTokensParam: opts.maxTokensParam ?? "max_tokens",
    streamUsage: opts.streamUsage ?? true,
    fetchImpl,
  });
}

describe("OpenAiCompatibleProvider", () => {
  it("streams text, usage and stop reason", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        streamOf([
          chunk({ choices: [{ delta: { content: "Bon" } }] }),
          chunk({ choices: [{ delta: { content: "jour" }, finish_reason: "stop" }] }),
          chunk({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }),
          "data: [DONE]\n\n",
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const events = await collect(
      provider(fetchImpl, { maxTokensParam: "max_completion_tokens" }).stream({
        system: "sys",
        messages: [{ role: "user", content: "Salut" }],
        maxTokens: 100,
      }),
    );
    expect(events).toEqual([
      { type: "text", text: "Bon" },
      { type: "text", text: "jour" },
      { type: "usage", inputTokens: 12, outputTokens: 3 },
      { type: "stop", reason: "end" },
    ]);

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer secret");
    const body = JSON.parse(init.body);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.max_completion_tokens).toBe(100);
    expect(body.max_tokens).toBeUndefined();
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("omits stream_options when unsupported and maps length to max_tokens", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(streamOf([chunk({ choices: [{ delta: { content: "x" }, finish_reason: "length" }] })]), { status: 200 }),
    ) as unknown as typeof fetch;
    const events = await collect(
      provider(fetchImpl, { streamUsage: false }).stream({ system: "", messages: [], maxTokens: 5 }),
    );
    expect(events.at(-1)).toEqual({ type: "stop", reason: "max_tokens" });
    const body = JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.stream_options).toBeUndefined();
  });

  it.each([
    [401, "", "auth"],
    [429, "rate limit exceeded", "rate_limit"],
    [429, "You exceeded your current quota", "quota"],
    [400, "bad model", "bad_request"],
    [503, "", "unavailable"],
  ])("classifies HTTP %i as %s", async (status, body, kind) => {
    const fetchImpl = vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
    const err = await collect(provider(fetchImpl).stream({ system: "", messages: [], maxTokens: 5 })).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe(kind);
    // The raw provider body (which could echo secrets) is never put in the message.
    expect((err as ProviderError).message).toBe(`HTTP ${status}`);
  });

  it("reports network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await collect(provider(fetchImpl).stream({ system: "", messages: [], maxTokens: 5 })).catch((e) => e);
    expect((err as ProviderError).kind).toBe("network");
  });
});
