import Anthropic from "@anthropic-ai/sdk";

import {
  ProviderError,
  classifyHttpError,
  type AiProvider,
  type ProviderCheck,
  type StreamEvent,
  type StreamRequest,
} from "./types";

/** Models that accept the server-side `fallbacks: "default"` parameter. */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
/** Models that accept `output_config.effort`. */
const EFFORT_MODELS = new Set([
  "claude-fable-5-1",
  "claude-fable-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5-5",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-haiku-5-5",
]);

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high";
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicOptions) {
    this.model = opts.model;
    // No automatic retries: a retry is a second billed request, and the budget
    // guard must see every call. The user can simply resend.
    this.client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 0 });
  }

  private toProviderError(err: unknown): ProviderError | null {
    if (err instanceof Anthropic.APIConnectionError) return new ProviderError("network", "network error");
    if (err instanceof Anthropic.APIError) {
      return classifyHttpError(err.status ?? 500, JSON.stringify(err.error ?? { message: err.message }), [
        this.opts.apiKey,
      ]);
    }
    return null;
  }

  async check(signal?: AbortSignal): Promise<ProviderCheck> {
    try {
      // Model metadata lookup: authenticated, generates no tokens.
      await this.client.models.retrieve(this.model, {}, { signal });
      return { ok: true, generation: false };
    } catch (err) {
      const pe = this.toProviderError(err);
      if (pe) return { ok: false, error: pe };
      throw err;
    }
  }

  async *stream(request: StreamRequest): AsyncGenerator<StreamEvent> {
    const useFallbacks = FALLBACK_MODELS.has(this.model);
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: request.messages,
        ...(EFFORT_MODELS.has(this.model) ? { output_config: { effort: this.opts.effort } } : {}),
        // If a safety classifier declines, Anthropic re-runs the request on its
        // recommended fallback model instead of returning an empty refusal.
        ...(useFallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      { signal: request.signal },
    );

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield {
        type: "usage",
        inputTokens:
          (final.usage.input_tokens ?? 0) +
          (final.usage.cache_creation_input_tokens ?? 0) +
          (final.usage.cache_read_input_tokens ?? 0),
        outputTokens: final.usage.output_tokens ?? 0,
      };
      const reason = final.stop_reason;
      yield {
        type: "stop",
        reason:
          reason === "end_turn" || reason === "stop_sequence"
            ? "end"
            : reason === "max_tokens"
              ? "max_tokens"
              : reason === "refusal"
                ? "refusal"
                : "other",
      };
    } catch (err) {
      if (request.signal?.aborted) throw err;
      throw this.toProviderError(err) ?? err;
    }
  }
}
