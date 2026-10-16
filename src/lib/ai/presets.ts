/**
 * Supported AI providers. Gemini uses Google's native API, Anthropic its
 * official SDK; the others share the OpenAI-compatible Chat Completions
 * protocol, so adding one is a matter of adding a preset here.
 */

export type ProviderId = "gemini" | "groq" | "mistral" | "openrouter" | "openai" | "anthropic";

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  protocol: "gemini" | "openai" | "anthropic";
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string;
  /** Name of the output-length parameter accepted by the provider. */
  maxTokensParam: "max_tokens" | "max_completion_tokens";
  /** Whether `stream_options.include_usage` is accepted. */
  streamUsage: boolean;
  /** Whether a given model is billed per token on this provider. */
  isPaid: (model: string) => boolean;
  /** Whether JARVIS_PROVIDER_IS_FREE=true may mark this provider as free. */
  canBeFree: boolean;
  /** Short note shown in the dashboard. */
  note: string;
}

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-flash-latest",
    maxTokensParam: "max_tokens",
    streamUsage: true,
    isPaid: () => false,
    canBeFree: true,
    note: "Quota gratuit si la facturation n'est pas activée sur le projet Google. Les données du niveau gratuit peuvent servir à améliorer les produits Google.",
  },
  groq: {
    id: "groq",
    label: "Groq",
    protocol: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    maxTokensParam: "max_completion_tokens",
    streamUsage: true,
    isPaid: () => false,
    canBeFree: true,
    note: "Niveau gratuit sans carte bancaire, limité en requêtes par minute et par jour.",
  },
  mistral: {
    id: "mistral",
    label: "Mistral AI",
    protocol: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    apiKeyEnv: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
    maxTokensParam: "max_tokens",
    streamUsage: false,
    isPaid: () => false,
    canBeFree: true,
    note: "Offre « Experiment » gratuite et limitée ; entreprise française. Vérifier les conditions d'usage des données.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    maxTokensParam: "max_tokens",
    streamUsage: true,
    isPaid: (model) => !model.endsWith(":free"),
    canBeFree: true,
    note: "Les modèles suffixés « :free » sont gratuits mais très limités ; les autres sont payants.",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-5-mini",
    maxTokensParam: "max_completion_tokens",
    streamUsage: true,
    isPaid: () => true,
    canBeFree: false,
    note: "Payant à l'usage.",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-5-5",
    maxTokensParam: "max_tokens",
    streamUsage: false,
    isPaid: () => true,
    canBeFree: false,
    note: "Payant à l'usage (crédits prépayés). Un abonnement Claude/Claude Code n'inclut pas l'API.",
  },
};

export function isProviderId(value: string): value is ProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDER_PRESETS, value);
}
