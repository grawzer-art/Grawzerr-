import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "./fake-supabase";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com" };
const FAKE_KEY = "AQ.Ab8RN6FAKE-check_test_0123456789";
let db: FakeDb;

vi.mock("@/lib/supabase/server", () => ({
  requireUser: async () => ({ ok: true, supabase: db.client(), user: USER }),
}));

async function check() {
  const { POST } = await import("@/app/api/ai/check/route");
  const res = await POST(new Request("http://localhost/api/ai/check", { method: "POST" }));
  return { res, json: await res.json() };
}

beforeEach(() => {
  db = new FakeDb();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.stubEnv("JARVIS_AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", FAKE_KEY);
});

describe("POST /api/ai/check", () => {
  it("reports success (metadata + minimal generation on the free tier) without exposing the key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: "models/gemini-flash-latest" })));
    vi.stubGlobal("fetch", fetchMock);
    const { json } = await check();
    expect(json).toMatchObject({
      ok: true,
      generation: true,
      provider: "gemini",
      model: "gemini-flash-latest",
      keyEnv: "GEMINI_API_KEY",
    });
    expect(json.key.format).toMatch(/^AQ\./);
    expect(JSON.stringify(json)).not.toContain(FAKE_KEY);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest");
    expect(init.method).toBe("GET");
    const [genUrl] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(genUrl).toContain(":generateContent");
    // The probe is recorded so the rate guards see it; free tier, cost 0.
    expect(db.tables.usage_events.at(-1)).toMatchObject({ kind: "check", estimated_cost_usd: 0 });
    expect(db.tables.action_log.at(-1)).toMatchObject({ action: "ai.check", status: "success" });
  });

  it("returns Google's own message when generation is refused (403 denied access)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const responses = [
      new Response(JSON.stringify({ name: "models/gemini-flash-latest" })),
      new Response(
        JSON.stringify({
          error: { code: 403, message: "Your project has been denied access. Please contact support.", status: "PERMISSION_DENIED" },
        }),
        { status: 403 },
      ),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    const { json } = await check();
    expect(json.ok).toBe(false);
    expect(json.error).toMatchObject({
      kind: "permission",
      httpStatus: 403,
      reason: "PERMISSION_DENIED",
      detail: "Your project has been denied access. Please contact support.",
    });
  });

  it("never sends a generation probe for a paid provider", async () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-0000000000000000");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { json } = await check();
    expect(json).toMatchObject({ ok: true, generation: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("GET");
    expect(db.tables.usage_events ?? []).toHaveLength(0);
  });

  it("explains a rejected key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 401,
                status: "UNAUTHENTICATED",
                message: "Expected OAuth 2 access token",
                details: [{ reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED" }],
              },
            }),
            { status: 401 },
          ),
      ),
    );
    const { json } = await check();
    expect(json.ok).toBe(false);
    expect(json.error).toMatchObject({ kind: "auth", httpStatus: 401, reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED" });
    expect(json.error.message).toMatch(/Créez une nouvelle clé/);
  });

  it("says when the variable is missing for this environment", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { json } = await check();
    expect(json).toMatchObject({ ok: false, error: { kind: "not_configured" }, key: { format: "absente", length: 0 } });
  });
});

describe("POST /api/ai/check — Groq (free, OpenAI-compatible)", () => {
  it("tests the key and a minimal generation", async () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_FAKEFAKEFAKEFAKEFAKE0000");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [], choices: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { json } = await check();
    expect(json).toMatchObject({ ok: true, generation: true, provider: "groq", model: "openai/gpt-oss-120b" });
    const [keyUrl, keyInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(keyUrl).toBe("https://api.groq.com/openai/v1/models");
    expect(keyInit.method).toBe("GET");
    const [genUrl, genInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(genUrl).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(genInit.body as string);
    expect(body).toMatchObject({ model: "openai/gpt-oss-120b", max_completion_tokens: 16 });
    expect(body.stream).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("gsk_FAKE");
  });

  it("reports a refused generation", async () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_FAKEFAKEFAKEFAKEFAKE0000");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const responses = [
      new Response(JSON.stringify({ data: [] })),
      new Response(JSON.stringify({ error: { message: "The model `x` does not exist", code: "model_not_found" } }), {
        status: 404,
      }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    const { json } = await check();
    expect(json).toMatchObject({ ok: false, error: { kind: "model_not_found", httpStatus: 404 } });
  });
});
