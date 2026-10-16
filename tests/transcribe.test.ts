import { beforeEach, describe, expect, it, vi } from "vitest";

import { audioExtension, cleanTranscript, isLikelyHallucination, transcribe } from "@/lib/ai/transcribe";
import { ProviderError } from "@/lib/ai/types";
import { createVad } from "@/lib/client/recorder";

import { FakeDb } from "./fake-supabase";

// Fake key (not a real credential).
const KEY = "gsk_fake_transcribe_test_0123456789";

describe("Whisper helpers", () => {
  it("maps recorder MIME types to file extensions Groq accepts", () => {
    expect(audioExtension("audio/mp4")).toBe("m4a");
    expect(audioExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExtension("AUDIO/OGG; codecs=opus")).toBe("ogg");
    expect(audioExtension("text/plain")).toBeNull();
    expect(audioExtension("")).toBeNull();
  });

  it("drops Whisper's classic silence hallucinations, keeps real speech", () => {
    expect(isLikelyHallucination("Sous-titres réalisés par la communauté d'Amara.org")).toBe(true);
    expect(isLikelyHallucination("Merci d'avoir regardé cette vidéo !")).toBe(true);
    expect(isLikelyHallucination("…")).toBe(true);
    expect(isLikelyHallucination("Merci d'avoir regardé mon dossier, qu'en penses-tu ?")).toBe(false);
    expect(isLikelyHallucination("Quel temps fait-il demain ?")).toBe(false);
  });

  it("keeps only segments that contain speech", () => {
    expect(
      cleanTranscript({
        text: "ignored",
        segments: [
          { text: " Bonjour JARVIS,", no_speech_prob: 0.02 },
          { text: " Sous-titrage ST' 501", no_speech_prob: 0.3 },
          { text: " euh", no_speech_prob: 0.95 },
          { text: " comment vas-tu ?", no_speech_prob: 0.1 },
        ],
      }),
    ).toBe("Bonjour JARVIS, comment vas-tu ?");
    expect(cleanTranscript({ text: "  Salut  " })).toBe("Salut");
    expect(cleanTranscript({ segments: [{ text: "Merci d'avoir regardé.", no_speech_prob: 0.5 }] })).toBe("");
  });
});

describe("transcribe()", () => {
  it("posts the audio to Groq with a Bearer key, in French", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "Bonjour", duration: 1.2, segments: [{ text: "Bonjour", no_speech_prob: 0.01 }] })),
    );
    const out = await transcribe({
      apiKey: KEY,
      model: "whisper-large-v3-turbo",
      baseUrl: "https://api.groq.com/openai/v1/",
      audio: new Blob(["x"], { type: "audio/mp4" }),
      filename: "audio.m4a",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(out).toEqual({ text: "Bonjour", durationSec: 1.2 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("fr");
    expect(form.get("response_format")).toBe("verbose_json");
    expect((form.get("file") as File).name).toBe("audio.m4a");
  });

  it("classifies provider errors without leaking the key", async () => {
    const body = JSON.stringify({ error: { message: `Invalid API Key ${KEY}`, type: "invalid_request_error", code: "invalid_api_key" } });
    const fetchMock = vi.fn(async () => new Response(body, { status: 401 }));
    const err = await transcribe({
      apiKey: KEY,
      model: "m",
      baseUrl: "https://api.groq.com/openai/v1",
      audio: new Blob(["x"], { type: "audio/mp4" }),
      filename: "audio.m4a",
      fetchImpl: fetchMock as unknown as typeof fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe("auth");
    expect((err as ProviderError).detail ?? "").not.toContain(KEY);
  });
});

describe("createVad", () => {
  const run = (levels: number[], frameMs = 50) => {
    const vad = createVad({ silenceMs: 1000, noSpeechMs: 3000, maxMs: 10_000 });
    let state = vad.state;
    levels.forEach((rms, i) => (state = vad.step(rms, i * frameMs)));
    return state;
  };
  const quiet = (n: number) => Array<number>(n).fill(0.005);
  const voice = (n: number) => Array<number>(n).fill(0.2);

  it("waits, hears speech, then stops after a pause", () => {
    expect(run(quiet(10))).toBe("waiting");
    expect(run([...quiet(10), ...voice(10)])).toBe("speaking");
    expect(run([...quiet(10), ...voice(10), ...quiet(10)])).toBe("speaking");
    expect(run([...quiet(10), ...voice(10), ...quiet(25)])).toBe("done");
  });

  it("ignores a single click and gives up when nobody speaks", () => {
    expect(run([...quiet(5), 0.3, ...quiet(5)])).toBe("waiting");
    expect(run(quiet(61))).toBe("no_speech");
  });

  it("caps a very long utterance", () => {
    expect(run([...quiet(5), ...voice(210)])).toBe("done");
  });
});

// ── Route ────────────────────────────────────────────────────────────

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com" };
let db: FakeDb;
let authOk = true;

vi.mock("@/lib/supabase/server", () => ({
  requireUser: async () =>
    authOk
      ? { ok: true, supabase: db.client(), user: USER }
      : { ok: false, status: 401, code: "unauthenticated", message: "Session expirée." },
}));

async function postAudio(blob: Blob | null, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/transcribe/route");
  const form = new FormData();
  if (blob) form.append("audio", blob, "audio");
  const res = await POST(new Request("http://localhost/api/transcribe", { method: "POST", body: form, headers }));
  return { res, body: (await res.json()) as { text?: string; code?: string; message?: string; detail?: string } };
}

describe("POST /api/transcribe", () => {
  beforeEach(() => {
    db = new FakeDb();
    authOk = true;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.stubEnv("GROQ_API_KEY", KEY);
    vi.stubEnv("JARVIS_DAILY_REQUEST_LIMIT", "200");
    vi.stubEnv("JARVIS_PER_MINUTE_LIMIT", "12");
  });

  const audio = () => new Blob([new Uint8Array(2048)], { type: "audio/mp4" });

  it("rejects unauthenticated and cross-site requests", async () => {
    authOk = false;
    expect((await postAudio(audio())).res.status).toBe(401);
    authOk = true;
    const { res } = await postAudio(audio(), { origin: "https://evil.example", host: "localhost" });
    expect(res.status).toBe(403);
  });

  it("says plainly when Whisper is not configured", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const { res, body } = await postAudio(audio());
    expect(res.status).toBe(503);
    expect(body.code).toBe("transcription_not_configured");
  });

  it("can be switched off to keep audio on the device", async () => {
    vi.stubEnv("JARVIS_TRANSCRIPTION", "off");
    expect((await postAudio(audio())).res.status).toBe(503);
  });

  it("validates the recording", async () => {
    expect((await postAudio(null)).res.status).toBe(400);
    expect((await postAudio(new Blob([], { type: "audio/mp4" }))).res.status).toBe(400);
    expect((await postAudio(new Blob(["x"], { type: "text/plain" }))).res.status).toBe(415);
    expect((await postAudio(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "audio/mp4" }))).res.status).toBe(413);
  });

  it("returns the transcript and records a free usage event, without storing audio", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ text: "Bonjour JARVIS", segments: [{ text: "Bonjour JARVIS", no_speech_prob: 0.01 }] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { res, body } = await postAudio(audio());
    expect(res.status).toBe(200);
    expect(body).toEqual({ text: "Bonjour JARVIS" });
    expect(db.tables.usage_events).toHaveLength(1);
    expect(db.tables.usage_events[0]).toMatchObject({ kind: "transcribe", provider: "groq", estimated_cost_usd: 0 });
    expect(Object.keys(db.tables)).not.toContain("messages");
  });

  it("respects the per-minute guard before calling Groq", async () => {
    vi.stubEnv("JARVIS_PER_MINUTE_LIMIT", "1");
    db.tables.usage_events = [
      { id: 1, user_id: USER.id, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, created_at: new Date().toISOString() },
    ];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { res, body } = await postAudio(audio());
    expect(res.status).toBe(429);
    expect(body.code).toBe("rate_limited");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports provider errors with the redacted message", async () => {
    const msg = `Invalid API Key ${KEY}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: msg, code: "invalid_api_key" } }), { status: 401 })),
    );
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((l: unknown) => void logs.push(String(l)));
    const { res, body } = await postAudio(audio());
    expect(res.status).toBe(502);
    expect(body.code).toBe("provider_auth");
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
    expect(logs.join("\n")).toContain('"operation":"transcribe"');
  });
});
