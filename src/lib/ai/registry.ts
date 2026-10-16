import "server-only";

import { aiConfig } from "@/lib/config";

import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import { PROVIDER_PRESETS } from "./presets";
import type { AiProvider } from "./types";

/** Builds the configured provider, or null when no API key is set. */
export function createProvider(): AiProvider | null {
  const cfg = aiConfig();
  if (!cfg.configured) return null;
  const preset = PROVIDER_PRESETS[cfg.provider];
  if (preset.protocol === "gemini") {
    return new GeminiProvider({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl });
  }
  if (preset.protocol === "anthropic") {
    return new AnthropicProvider({ apiKey: cfg.apiKey, model: cfg.model, effort: cfg.anthropicEffort });
  }
  return new OpenAiCompatibleProvider({
    id: cfg.provider,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    maxTokensParam: preset.maxTokensParam,
    streamUsage: preset.streamUsage,
    // OpenRouter's model list is public; /key is the endpoint that validates a key.
    checkPath: cfg.provider === "openrouter" ? "key" : "models",
  });
}
