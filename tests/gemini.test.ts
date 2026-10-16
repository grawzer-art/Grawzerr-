import { describe, expect, it, vi } from "vitest";

import { GeminiProvider, normalizeGeminiModel } from "@/lib/ai/gemini";
import { ProviderError, describeProviderError } from "@/lib/ai/types";

import { collect, streamOf } from "./helpers";

// Fake key in the new AI Studio format (not a real credential).
const KEY = "AQ.Ab8RN6FAKE-test_key_0123456789abcdefghij";
const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\r\n\r\n`;

function googleError(code: number, status: string, message: string, reason?: string) {
  return JSON.stringify({
    error: {
      code,
      message,
      status,
      details: reason
        ? [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason, domain: "googleapis.com" }]
        : [],
    },
  });
}

function make(response: Response | (() => Response), model = "gemini-flash-latest") {
  const fetchImpl = vi.fn(async () => (typeof response === "function" ? response() : response));
  const provider = new GeminiProvider({ apiKey: KEY, model, fetchImpl: fetchImpl as unknown as typeof fetch });
  return { provider, fetchImpl };
}

const call = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i] as unknown as [string, RequestInit];

describe("GeminiProvider — request", () => {
  it("calls the native streaming endpoint with the key in x-goog-api-key only", async () => {
    const { provider, fetchImpl } = make(
      new Response(streamOf([sse({ candidates: [{ content: { parts: [{ text: "Bonjour" }] }, finishReason: "STOP" }] })])),
    );
    await collect(
      provider.stream({
        system: "Tu es JARVIS.",
        messages: [
          { role: "user", content: "Salut" },
          { role: "assistant", content: "Bonsoir." },
          { role: "user", content: "Bonjour" },
        ],
        maxTokens: 8192,
      }),
    );
    const [url, init] = call(fetchImpl);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse",
    );
    expect(url).not.toContain("key=");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(KEY);
    // The "AQ." key must never be sent as an OAuth Bearer token.
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("authorization");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Tu es JARVIS." }] });
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "Salut" }] },
      { role: "model", parts: [{ text: "Bonsoir." }] },
      { role: "user", parts: [{ text: "Bonjour" }] },
    ]);
    expect(body.generationConfig).toEqual({ maxOutputTokens: 8192 });
  });

  it("normalizes model names", () => {
    expect(normalizeGeminiModel(" models/gemini-3.5-flash ")).toBe("gemini-3.5-flash");
  });
});

describe("GeminiProvider — streaming", () => {
  it("streams text, skips thought parts and reports cumulative usage including thinking", async () => {
    const { provider } = make(
      new Response(
        streamOf([
          sse({ candidates: [{ content: { role: "model", parts: [{ text: "raisonnement", thought: true }] } }] }),
          sse({
            candidates: [{ content: { role: "model", parts: [{ text: "Bonjour, " }] } }],
            usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 2 },
          }),
          sse({
            candidates: [{ content: { role: "model", parts: [{ text: "Monsieur." }] }, finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 5, thoughtsTokenCount: 40, totalTokenCount: 945 },
            modelVersion: "gemini-3.5-flash",
          }),
        ]),
      ),
    );
    const events = await collect(provider.stream({ system: "s", messages: [{ role: "user", content: "Bonjour" }], maxTokens: 100 }));
    expect(events).toEqual([
      { type: "text", text: "Bonjour, " },
      { type: "text", text: "Monsieur." },
      { type: "usage", inputTokens: 900, outputTokens: 45 },
      { type: "stop", reason: "end" },
    ]);
  });

  it.each([
    ["MAX_TOKENS", "max_tokens"],
    ["SAFETY", "refusal"],
    ["PROHIBITED_CONTENT", "refusal"],
    ["OTHER", "other"],
  ])("maps finishReason %s to %s", async (finishReason, reason) => {
    const { provider } = make(new Response(streamOf([sse({ candidates: [{ content: { parts: [] }, finishReason }] })])));
    const events = await collect(provider.stream({ system: "", messages: [], maxTokens: 10 }));
    expect(events.at(-1)).toEqual({ type: "stop", reason });
  });

  it("treats a blocked prompt as a refusal", async () => {
    const { provider } = make(new Response(streamOf([sse({ promptFeedback: { blockReason: "SAFETY" } })])));
    const events = await collect(provider.stream({ system: "", messages: [], maxTokens: 10 }));
    expect(events.at(-1)).toEqual({ type: "stop", reason: "refusal" });
  });

  it("surfaces an error sent inside the stream", async () => {
    const { provider } = make(
      new Response(streamOf([sse({ error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } })])),
    );
    const err = await collect(provider.stream({ system: "", messages: [], maxTokens: 10 })).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe("unavailable");
  });
});

describe("GeminiProvider — errors", () => {
  it.each([
    [400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", "API_KEY_INVALID", "auth"],
    [
      401,
      "UNAUTHENTICATED",
      "Request had invalid authentication credentials. Expected OAuth 2 access token.",
      "ACCESS_TOKEN_TYPE_UNSUPPORTED",
      "auth",
    ],
    [403, "PERMISSION_DENIED", "Generative Language API has not been used in project 123.", "SERVICE_DISABLED", "permission"],
    [403, "PERMISSION_DENIED", "Requests from referer <empty> are blocked.", "API_KEY_HTTP_REFERRER_BLOCKED", "permission"],
    [400, "FAILED_PRECONDITION", "User location is not supported for the API use.", undefined, "permission"],
    [404, "NOT_FOUND", "models/gemini-9 is not found for API version v1beta.", undefined, "model_not_found"],
    [429, "RESOURCE_EXHAUSTED", "Resource has been exhausted (e.g. check quota).", undefined, "quota"],
    [429, "RESOURCE_EXHAUSTED", "Too many requests, please slow down.", undefined, "rate_limit"],
    [500, "INTERNAL", "Internal error.", undefined, "unavailable"],
  ])("HTTP %i %s (%s) → %s", async (code, status, message, reason, kind) => {
    const { provider } = make(new Response(googleError(code, status, message, reason), { status: code }));
    const err = (await collect(provider.stream({ system: "", messages: [], maxTokens: 10 })).catch((e) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(code);
    if (reason) expect(err.reason).toBe(reason);
    expect(describeProviderError(err).length).toBeGreaterThan(10);
  });

  it("gives actionable advice for ACCESS_TOKEN_TYPE_UNSUPPORTED", async () => {
    const { provider } = make(
      new Response(googleError(401, "UNAUTHENTICATED", "Expected OAuth 2 access token", "ACCESS_TOKEN_TYPE_UNSUPPORTED"), {
        status: 401,
      }),
    );
    const err = (await collect(provider.stream({ system: "", messages: [], maxTokens: 10 })).catch((e) => e)) as ProviderError;
    expect(describeProviderError(err)).toMatch(/Créez une nouvelle clé/);
  });

  it("never keeps the key in error details, even if Google echoes it", async () => {
    const { provider } = make(
      new Response(googleError(400, "INVALID_ARGUMENT", `API key not valid: ${KEY}`, "API_KEY_INVALID"), { status: 400 }),
    );
    const err = (await collect(provider.stream({ system: "", messages: [], maxTokens: 10 })).catch((e) => e)) as ProviderError;
    expect(err.detail).not.toContain(KEY);
    expect(err.detail).toContain("[secret]");
    expect(err.message).toBe("HTTP 400");
  });

  it("reports network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const provider = new GeminiProvider({ apiKey: KEY, model: "m", fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = (await collect(provider.stream({ system: "", messages: [], maxTokens: 10 })).catch((e) => e)) as ProviderError;
    expect(err.kind).toBe("network");
  });
});

describe("GeminiProvider — check()", () => {
  it("validates key and model with a token-free GET on the model", async () => {
    const { provider, fetchImpl } = make(new Response(JSON.stringify({ name: "models/gemini-flash-latest" })));
    expect(await provider.check()).toEqual({ ok: true });
    const [url, init] = call(fetchImpl);
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
  });

  it("returns the classified error", async () => {
    const { provider } = make(new Response(googleError(400, "INVALID_ARGUMENT", "API key not valid.", "API_KEY_INVALID"), { status: 400 }));
    const res = await provider.check();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatchObject({ kind: "auth", reason: "API_KEY_INVALID", status: 400 });
  });
});
