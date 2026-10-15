import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatStreamEvent } from "@/lib/types";

import { FakeDb } from "./fake-supabase";
import { streamOf } from "./helpers";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com" };
let db: FakeDb;
let authOk = true;

vi.mock("@/lib/supabase/server", () => ({
  requireUser: async () =>
    authOk
      ? { ok: true, supabase: db.client(), user: USER }
      : { ok: false, status: 401, code: "unauthenticated", message: "Session expirée." },
}));

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

function mockProvider(chunks: string[], status = 200) {
  const fetchMock = vi.fn(async () => new Response(status === 200 ? streamOf(chunks) : "nope", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/chat/route");
  const res = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));
  const text = await res.text();
  const events = text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ChatStreamEvent);
  return { res, events };
}

beforeEach(() => {
  db = new FakeDb();
  authOk = true;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("JARVIS_AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("JARVIS_MONTHLY_BUDGET_USD", "0");
  vi.stubEnv("JARVIS_DAILY_REQUEST_LIMIT", "200");
});

describe("POST /api/chat", () => {
  it("rejects unauthenticated requests", async () => {
    authOk = false;
    const { res, events } = await post({ message: "Salut" });
    expect(res.status).toBe(401);
    expect(events[0]).toMatchObject({ type: "error", code: "unauthenticated" });
  });

  it("validates the message", async () => {
    const { res } = await post({ message: "   " });
    expect(res.status).toBe(400);
  });

  it("refuses to answer when no AI key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { res, events } = await post({ message: "Salut" });
    expect(res.status).toBe(503);
    expect(events[0]).toMatchObject({ code: "ai_not_configured" });
    expect(db.tables.messages ?? []).toHaveLength(0);
  });

  it("streams a reply and persists conversation, messages, usage and log", async () => {
    db.tables.memories = [
      { id: "m1", user_id: USER.id, content: "Préfère le thé", category: "preference", importance: 4, status: "confirmed", updated_at: "2026-01-01" },
      { id: "m2", user_id: USER.id, content: "Hypothèse non validée", category: "other", importance: 5, status: "suggested", updated_at: "2026-01-01" },
    ];
    const fetchMock = mockProvider([
      sse({ choices: [{ delta: { content: "Bonjour" } }] }),
      sse({ choices: [{ delta: { content: ", Monsieur." }, finish_reason: "stop" }] }),
      sse({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 8 } }),
      "data: [DONE]\n\n",
    ]);

    const { res, events } = await post({ message: "Salut JARVIS, génial de te voir !" });
    expect(res.status).toBe(200);
    expect(events[0]).toMatchObject({ type: "meta", provider: "gemini", tone: "enthusiasm" });
    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("")).toBe(
      "Bonjour, Monsieur.",
    );
    expect(events.at(-1)).toMatchObject({
      type: "done",
      usage: { inputTokens: 120, outputTokens: 8, estimated: false, costUsd: 0 },
    });

    // The system prompt carries confirmed memories only.
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[0].content).toContain("Préfère le thé");
    expect(body.messages[0].content).not.toContain("Hypothèse non validée");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Salut JARVIS, génial de te voir !" });

    expect(db.tables.conversations).toHaveLength(1);
    expect(db.tables.messages.map((m) => [m.role, m.content, m.status])).toEqual([
      ["user", "Salut JARVIS, génial de te voir !", "complete"],
      ["assistant", "Bonjour, Monsieur.", "complete"],
    ]);
    expect(db.tables.usage_events[0]).toMatchObject({ input_tokens: 120, output_tokens: 8, tokens_estimated: false });
    expect(db.tables.action_log.at(-1)).toMatchObject({ action: "chat.reply", status: "success" });
  });

  it("sends prior turns of an existing conversation", async () => {
    mockProvider([sse({ choices: [{ delta: { content: "A" }, finish_reason: "stop" }] })]);
    const first = await post({ message: "Premier" });
    const conversationId = (first.events[0] as { conversationId: string }).conversationId;

    const fetchMock = mockProvider([sse({ choices: [{ delta: { content: "B" }, finish_reason: "stop" }] })]);
    await post({ message: "Second", conversationId });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages.slice(1)).toEqual([
      { role: "user", content: "Premier" },
      { role: "assistant", content: "A" },
      { role: "user", content: "Second" },
    ]);
  });

  it("returns 404 for an unknown conversation", async () => {
    const { res } = await post({ message: "x", conversationId: "22222222-2222-4222-8222-222222222222" });
    expect(res.status).toBe(404);
  });

  it("blocks paid providers when no budget is set, without calling them", async () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = mockProvider([]);
    const { res, events } = await post({ message: "Salut" });
    expect(res.status).toBe(429);
    expect(events[0]).toMatchObject({ code: "paid_provider_without_budget" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.tables.messages ?? []).toHaveLength(0);
    expect(db.tables.action_log.at(-1)).toMatchObject({ action: "chat.blocked", status: "blocked" });
  });

  it("enforces the daily request cap from recorded usage", async () => {
    vi.stubEnv("JARVIS_DAILY_REQUEST_LIMIT", "2");
    const now = new Date().toISOString();
    db.tables.usage_events = [1, 2].map((i) => ({
      id: i, user_id: USER.id, input_tokens: 10, output_tokens: 10, estimated_cost_usd: 0, created_at: now,
    }));
    const fetchMock = mockProvider([]);
    const { res, events } = await post({ message: "Encore" });
    expect(res.status).toBe(429);
    expect(events[0]).toMatchObject({ code: "daily_requests_reached" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when usage cannot be read", async () => {
    db.failTables.add("usage_events");
    const fetchMock = mockProvider([]);
    const { res } = await post({ message: "Salut" });
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports provider errors honestly and records them", async () => {
    mockProvider([], 401);
    const { events } = await post({ message: "Salut" });
    expect(events.at(-1)).toMatchObject({ type: "error", code: "provider_auth" });
    const assistant = db.tables.messages.find((m) => m.role === "assistant");
    expect(assistant).toMatchObject({ status: "error" });
    expect(db.tables.action_log.at(-1)).toMatchObject({ status: "failure" });
    // Usage is still recorded (estimated) because a failed call may be billed.
    expect(db.tables.usage_events[0]).toMatchObject({ tokens_estimated: true });
  });
});

describe("POST /api/chat origin check", () => {
  it("rejects cross-site requests", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "localhost" },
        body: JSON.stringify({ message: "x" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
