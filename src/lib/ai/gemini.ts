import { parseSse } from "./sse";
import {
  ProviderError,
  classifyHttpError,
  type AiProvider,
  type CheckOptions,
  type ProviderCheck,
  type StreamEvent,
  type StreamRequest,
} from "./types";

/**
 * Native Gemini API client (generativelanguage.googleapis.com).
 *
 * The key travels only in the `x-goog-api-key` header, which accepts both
 * legacy "AIza…" keys and the "AQ." authentication keys that Google AI
 * Studio issues since 2026. Sending an "AQ." key as `Authorization: Bearer`
 * (the OpenAI-compatible route) makes Google treat it as an OAuth token and
 * reject it with 401 ACCESS_TOKEN_TYPE_UNSUPPORTED.
 */

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

const REFUSAL_REASONS = new Set(["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);

/** Accepts "gemini-x", "models/gemini-x" or accidental whitespace. */
export function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//, "");
}

export class GeminiProvider implements AiProvider {
  readonly id = "gemini";
  readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly opts: GeminiOptions) {
    this.model = normalizeGeminiModel(opts.model);
    this.baseUrl = (opts.baseUrl ?? GEMINI_BASE_URL).replace(/\/$/, "");
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", "x-goog-api-key": this.opts.apiKey };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    try {
      return await fetchImpl(url, init);
    } catch (err) {
      if (init.signal?.aborted) throw err;
      throw new ProviderError("network", "network error");
    }
  }

  private async fail(res: Response): Promise<never> {
    const body = await res.text().catch(() => "");
    throw classifyHttpError(res.status, body, [this.opts.apiKey]);
  }

  async check(signal?: AbortSignal, options: CheckOptions = {}): Promise<ProviderCheck> {
    try {
      const model = encodeURIComponent(this.model);
      const res = await this.send(`${this.baseUrl}/models/${model}`, {
        method: "GET",
        headers: this.headers(),
        signal,
      });
      if (!res.ok) await this.fail(res);
      if (!options.generate) return { ok: true, generation: false };

      // Reading model metadata can succeed while generation is refused
      // (403 PERMISSION_DENIED): only a real, minimal request proves it works.
      const gen = await this.send(`${this.baseUrl}/models/${model}:generateContent`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Réponds seulement : OK" }] }],
          generationConfig: { maxOutputTokens: 64 },
        }),
        signal,
      });
      if (!gen.ok) await this.fail(gen);
      return { ok: true, generation: true };
    } catch (err) {
      if (err instanceof ProviderError) return { ok: false, error: err };
      throw err;
    }
  }

  async *stream(request: StreamRequest): AsyncGenerator<StreamEvent> {
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: request.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: request.maxTokens },
    };

    const res = await this.send(
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`,
      { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal: request.signal },
    );
    if (!res.ok || !res.body) await this.fail(res);

    let stop: "end" | "max_tokens" | "refusal" | "other" | null = null;
    let usage: { inputTokens: number; outputTokens: number } | null = null;

    for await (const msg of parseSse(res.body!)) {
      let chunk: GeminiChunk;
      try {
        chunk = JSON.parse(msg.data) as GeminiChunk;
      } catch {
        continue;
      }
      if (chunk.error) {
        throw classifyHttpError(chunk.error.code ?? 500, JSON.stringify(chunk), [this.opts.apiKey]);
      }
      if (chunk.promptFeedback?.blockReason) stop = "refusal";
      const candidate = chunk.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        // Thought summaries are internal reasoning, never shown as the answer.
        if (part.text && !part.thought) yield { type: "text", text: part.text };
      }
      if (candidate?.finishReason) {
        const r = candidate.finishReason;
        stop = r === "STOP" ? "end" : r === "MAX_TOKENS" ? "max_tokens" : REFUSAL_REASONS.has(r) ? "refusal" : "other";
      }
      // usageMetadata is cumulative: the last value is the total.
      if (chunk.usageMetadata) {
        const u = chunk.usageMetadata;
        usage = {
          inputTokens: u.promptTokenCount ?? 0,
          outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
        };
      }
    }

    if (usage && (usage.inputTokens || usage.outputTokens)) yield { type: "usage", ...usage };
    yield { type: "stop", reason: stop ?? "end" };
  }
}
