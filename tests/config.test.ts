import { afterEach, describe, expect, it, vi } from "vitest";

import { aiConfig, cleanApiKey, isEmailAllowed } from "@/lib/config";

afterEach(() => vi.unstubAllEnvs());

describe("config", () => {
  it("denies everyone when the allowlist is empty", () => {
    vi.stubEnv("JARVIS_ALLOWED_EMAILS", "");
    expect(isEmailAllowed("someone@example.com")).toBe(false);
  });

  it("matches allowlisted e-mails case-insensitively", () => {
    vi.stubEnv("JARVIS_ALLOWED_EMAILS", " Me@Example.com , other@x.io");
    expect(isEmailAllowed("me@example.COM")).toBe(true);
    expect(isEmailAllowed("intruder@example.com")).toBe(false);
  });

  it("defaults to Gemini and is unconfigured without a key", () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const c = aiConfig();
    expect(c.provider).toBe("gemini");
    expect(c.configured).toBe(false);
    expect(c.paid).toBe(false);
  });

  it("never lets a paid provider be declared free", () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("JARVIS_PROVIDER_IS_FREE", "true");
    const c = aiConfig();
    expect(c.paid).toBe(true);
    expect(c.model).toBe("claude-opus-5-5");
  });

  it("can force a free-tier provider to be accounted as paid", () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "gemini");
    vi.stubEnv("JARVIS_PROVIDER_IS_FREE", "false");
    expect(aiConfig().paid).toBe(true);
  });

  it("treats OpenRouter :free models as free and others as paid", () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "openrouter");
    vi.stubEnv("JARVIS_AI_MODEL", "some/model:free");
    expect(aiConfig().paid).toBe(false);
    vi.stubEnv("JARVIS_AI_MODEL", "some/model");
    expect(aiConfig().paid).toBe(true);
  });
});

describe("cleanApiKey", () => {
  it.each([
    ["  AQ.abc123  ", "AQ.abc123"],
    ['"AQ.abc123"', "AQ.abc123"],
    ["'AQ.abc123'\n", "AQ.abc123"],
    ["GEMINI_API_KEY=AQ.abc123", "AQ.abc123"],
    ["Bearer AQ.abc123", "AQ.abc123"],
    ["AIzaSyABC", "AIzaSyABC"],
  ])("%j → %s", (raw, clean) => {
    expect(cleanApiKey(raw, "GEMINI_API_KEY")).toBe(clean);
  });

  it("is applied to the configured key", () => {
    vi.stubEnv("JARVIS_AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", ' "AQ.abc123" ');
    vi.stubEnv("JARVIS_AI_MODEL", '"gemini-3.5-flash"');
    const c = aiConfig();
    expect(c.apiKey).toBe("AQ.abc123");
    expect(c.model).toBe("gemini-3.5-flash");
  });
});

describe("keyLikeEnvNames", () => {
  it("lists only names of key-like variables, never values", async () => {
    const { keyLikeEnvNames } = await import("@/lib/config");
    const names = keyLikeEnvNames({
      GROK_API_KEY: "gsk_secret",
      JARVIS_AI_PROVIDER: "groq",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
      VERCEL_URL: "x",
      PATH: "/bin",
      GEMINI_API_KEY: "AQ.secret",
    } as unknown as NodeJS.ProcessEnv);
    expect(names).toEqual(["GEMINI_API_KEY", "GROK_API_KEY"]);
    expect(names.join()).not.toContain("secret");
  });
});
