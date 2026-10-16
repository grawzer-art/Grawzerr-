import { parseSse } from "./sse";
import {
  ProviderError,
  classifyHttpError,
  type AiProvider,
  type ProviderCheck,
  type StreamEvent,
  type StreamRequest,
} from "./types";

export interface OpenAiCompatibleOptions {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokensParam: "max_tokens" | "max_completion_tokens";
  streamUsage: boolean;
  /** Authenticated, token-free endpoint used by check() (relative to baseUrl). */
  checkPath?: string;
  fetchImpl?: typeof fetch;
}

interface ChunkChoice {
  delta?: { content?: string | null };
  finish_reason?: string | null;
}

interface Chunk {
  choices?: ChunkChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string };
}

/** Streaming client for any provider implementing OpenAI Chat Completions. */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly id: string;
  readonly model: string;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    this.id = opts.id;
    this.model = opts.model;
  }

  private url(path: string): string {
    return `${this.opts.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  }

  async check(signal?: AbortSignal): Promise<ProviderCheck> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await fetchImpl(this.url(this.opts.checkPath ?? "models"), {
        method: "GET",
        headers: { authorization: `Bearer ${this.opts.apiKey}` },
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      return { ok: false, error: new ProviderError("network", "network error") };
    }
    if (res.ok) return { ok: true, generation: false };
    const text = await res.text().catch(() => "");
    return { ok: false, error: classifyHttpError(res.status, text, [this.opts.apiKey]) };
  }

  async *stream(request: StreamRequest): AsyncGenerator<StreamEvent> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const body: Record<string, unknown> = {
      model: this.model,
      stream: true,
      messages: [{ role: "system", content: request.system }, ...request.messages],
      [this.opts.maxTokensParam]: request.maxTokens,
    };
    if (this.opts.streamUsage) body.stream_options = { include_usage: true };

    let res: Response;
    try {
      res = await fetchImpl(this.url("chat/completions"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (err) {
      if (request.signal?.aborted) throw err;
      throw new ProviderError("network", "network error");
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw classifyHttpError(res.status, text, [this.opts.apiKey]);
    }

    let stopReason: "end" | "max_tokens" | "refusal" | "other" | null = null;
    for await (const msg of parseSse(res.body)) {
      if (msg.data === "[DONE]") break;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(msg.data) as Chunk;
      } catch {
        continue;
      }
      if (chunk.error) {
        throw classifyHttpError(500, JSON.stringify(chunk), [this.opts.apiKey]);
      }
      for (const choice of chunk.choices ?? []) {
        const text = choice.delta?.content;
        if (text) yield { type: "text", text };
        if (choice.finish_reason) {
          stopReason =
            choice.finish_reason === "stop"
              ? "end"
              : choice.finish_reason === "length"
                ? "max_tokens"
                : choice.finish_reason === "content_filter"
                  ? "refusal"
                  : "other";
        }
      }
      if (chunk.usage && (chunk.usage.prompt_tokens || chunk.usage.completion_tokens)) {
        yield {
          type: "usage",
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
    yield { type: "stop", reason: stopReason ?? "end" };
  }
}
