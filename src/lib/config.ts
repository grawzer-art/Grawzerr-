import "server-only";

import { PROVIDER_PRESETS, isProviderId, type ProviderId } from "@/lib/ai/presets";

/** Server-side configuration. Never import this module from client components. */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return { url, key, configured: Boolean(url && key) };
}

export function allowedEmails(): string[] {
  return (process.env.JARVIS_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** An empty allowlist denies everyone: JARVIS must be opted into explicitly. */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.trim().toLowerCase());
}

/**
 * Cleans a key pasted into the Vercel dashboard: surrounding whitespace or
 * quotes, a "Bearer " prefix or a "NAME=" prefix copied by mistake.
 */
export function cleanApiKey(raw: string | undefined, envName: string): string {
  let key = (raw ?? "").trim();
  if (key.startsWith(`${envName}=`)) key = key.slice(envName.length + 1).trim();
  key = key.replace(/^["'`]+|["'`]+$/g, "").trim();
  key = key.replace(/^Bearer\s+/i, "").trim();
  return key;
}

export interface AiConfig {
  provider: ProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;
  configured: boolean;
  /** Whether this provider/model is billed. Paid usage is blocked unless a budget is set. */
  paid: boolean;
  anthropicEffort: "low" | "medium" | "high";
}

export function aiConfig(): AiConfig {
  const rawProvider = (process.env.JARVIS_AI_PROVIDER ?? "gemini").trim().toLowerCase();
  const provider: ProviderId = isProviderId(rawProvider) ? rawProvider : "gemini";
  const preset = PROVIDER_PRESETS[provider];
  const model = (process.env.JARVIS_AI_MODEL ?? "").trim().replace(/^["'`]+|["'`]+$/g, "") || preset.defaultModel;
  const apiKey = cleanApiKey(process.env[preset.apiKeyEnv], preset.apiKeyEnv);
  const freeOverride = process.env.JARVIS_PROVIDER_IS_FREE?.trim().toLowerCase();
  let paid = preset.isPaid(model);
  if (freeOverride === "false") paid = true;
  // A provider can only be declared free if its preset allows it (never Anthropic/OpenAI).
  if (freeOverride === "true" && preset.canBeFree) paid = false;
  const effortRaw = (process.env.JARVIS_ANTHROPIC_EFFORT ?? "low").trim();
  const anthropicEffort =
    effortRaw === "medium" || effortRaw === "high" ? effortRaw : "low";
  return {
    provider,
    model,
    apiKey,
    baseUrl: preset.baseUrl,
    configured: apiKey.length > 0,
    paid,
    anthropicEffort,
  };
}

export interface BudgetConfig {
  monthlyBudgetUsd: number;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  perMinuteLimit: number;
}

export function budgetConfig(): BudgetConfig {
  return {
    monthlyBudgetUsd: int("JARVIS_MONTHLY_BUDGET_USD", 0),
    dailyRequestLimit: int("JARVIS_DAILY_REQUEST_LIMIT", 200),
    dailyTokenLimit: int("JARVIS_DAILY_TOKEN_LIMIT", 400_000),
    perMinuteLimit: int("JARVIS_PER_MINUTE_LIMIT", 12),
  };
}
