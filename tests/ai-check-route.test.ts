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
  it("reports success without exposing the key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: "models/gemini-flash-latest" })));
    vi.stubGlobal("fetch", fetchMock);
    const { json } = await check();
    expect(json).toMatchObject({ ok: true, provider: "gemini", model: "gemini-flash-latest", keyEnv: "GEMINI_API_KEY" });
    expect(json.key.format).toMatch(/^AQ\./);
    expect(JSON.stringify(json)).not.toContain(FAKE_KEY);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest");
    expect(init.method).toBe("GET"); // metadata only: no generation, no tokens
    expect(db.tables.action_log.at(-1)).toMatchObject({ action: "ai.check", status: "success" });
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
