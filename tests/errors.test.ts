import { describe, expect, it } from "vitest";

import { classifyHttpError, describeKey, parseErrorBody, redact } from "@/lib/ai/types";

describe("redact", () => {
  it.each([
    "AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMY12345",
    "AQ.Ab8RN6DUMMY_dummy-0123456789",
    "sk-ant-api03-DUMMYDUMMYDUMMY",
    "sk-proj-DUMMYDUMMYDUMMYDUMMY",
    "gsk_DUMMYDUMMYDUMMYDUMMY1234",
    "ya29.DUMMYDUMMYDUMMY",
  ])("masks %s", (secret) => {
    expect(redact(`erreur: ${secret} !`)).toBe("erreur: [secret] !");
  });

  it("masks key query parameters and Bearer tokens", () => {
    expect(redact("GET /v1?key=abc123&alt=sse")).toBe("GET /v1?key=[secret]&alt=sse");
    expect(redact("Authorization: Bearer abcdefghijkl")).toBe("Authorization: [secret]");
  });

  it("masks explicitly known secrets of any shape", () => {
    expect(redact("valeur zzzz-custom-secret", ["zzzz-custom-secret"])).toBe("valeur [secret]");
  });
});

describe("describeKey", () => {
  it("reports only format and length", () => {
    expect(describeKey("AQ.abc")).toEqual({ format: "AQ. (clé d'authentification Google)", length: 6 });
    expect(describeKey("AIzaXYZ").format).toMatch(/AIza/);
    expect(describeKey("").format).toBe("absente");
    expect(describeKey("hello").format).toBe("format non reconnu");
  });
});

describe("parseErrorBody / classifyHttpError", () => {
  it("reads Google errors wrapped in an array", () => {
    const body = JSON.stringify([{ error: { code: 400, message: "m", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }]);
    expect(parseErrorBody(body)).toEqual({ message: "m", status: "INVALID_ARGUMENT", reason: "API_KEY_INVALID" });
  });

  it("reads OpenAI-style and Anthropic-style errors", () => {
    expect(classifyHttpError(401, JSON.stringify({ error: { message: "Incorrect API key provided", code: "invalid_api_key" } })).kind).toBe("auth");
    expect(classifyHttpError(401, JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } })).kind).toBe("auth");
    expect(classifyHttpError(429, "You exceeded your current quota").kind).toBe("quota");
    expect(classifyHttpError(400, "not json").kind).toBe("bad_request");
  });
});

describe("real Google responses (captured 2026-10-16)", () => {
  it("classifies the native 401 for an invalid AQ. key as an auth error", async () => {
    const { NATIVE_INVALID_AQ_KEY } = await import("./fixtures/google-errors");
    const err = classifyHttpError(401, NATIVE_INVALID_AQ_KEY);
    expect(err).toMatchObject({ kind: "auth", status: 401, reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED" });
    expect(err.detail).toBe("API key not valid. Please pass a valid API key.");
  });

  it("classifies the OpenAI-compatible 400 'Invalid Auth key.' as an auth error", async () => {
    const { OPENAI_COMPAT_INVALID_AQ_KEY } = await import("./fixtures/google-errors");
    const err = classifyHttpError(400, OPENAI_COMPAT_INVALID_AQ_KEY);
    expect(err).toMatchObject({ kind: "auth", status: 400 });
  });
});
