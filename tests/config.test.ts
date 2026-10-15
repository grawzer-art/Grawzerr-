import { afterEach, describe, expect, it, vi } from "vitest";

import { aiConfig, isEmailAllowed } from "@/lib/config";

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
