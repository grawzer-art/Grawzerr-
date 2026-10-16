import { PROVIDER_PRESETS } from "@/lib/ai/presets";
import { createProvider } from "@/lib/ai/registry";
import { describeKey, describeProviderError } from "@/lib/ai/types";
import { aiConfig } from "@/lib/config";
import { isSameOrigin } from "@/lib/server/http";
import { logAction } from "@/lib/server/log";
import { logServer } from "@/lib/server/logger";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface AiCheckResult {
  ok: boolean;
  /** True when a minimal real generation succeeded (free tiers only). */
  generation: boolean;
  provider: string;
  label: string;
  model: string;
  keyEnv: string;
  key: { format: string; length: number };
  /** `detail` is the provider's own message, with any credential redacted. */
  error?: { kind: string; httpStatus?: number; reason?: string; message: string; detail?: string };
}

/**
 * Verifies the configured AI key and model. On free tiers it also sends one
 * minimal generation request (a few tokens of free quota, 0 €), because a
 * key can read model metadata yet be refused generation. Paid providers only
 * get the metadata check, so this endpoint never spends money. The key is
 * never returned.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Origine de la requête refusée." }, { status: 403 });
  }
  const auth = await requireUser();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const cfg = aiConfig();
  const preset = PROVIDER_PRESETS[cfg.provider];
  const base: AiCheckResult = {
    ok: false,
    generation: false,
    provider: cfg.provider,
    label: preset.label,
    model: cfg.model,
    keyEnv: preset.apiKeyEnv,
    key: describeKey(cfg.apiKey),
  };

  const provider = createProvider();
  if (!provider) {
    const result: AiCheckResult = {
      ...base,
      error: {
        kind: "not_configured",
        message: `La variable ${preset.apiKeyEnv} est absente ou vide pour cet environnement Vercel (Production ou Preview). Ajoutez-la puis redéployez.`,
      },
    };
    logServer("warn", "ai.check", { provider: cfg.provider, model: cfg.model, ok: false, kind: "not_configured" });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let result: AiCheckResult;
  try {
    const generate = !cfg.paid;
    const check = await provider.check(controller.signal, { generate });
    if (generate) {
      // The probe counts as a request for the rate guards (free tier: cost 0).
      await auth.supabase.from("usage_events").insert({
        user_id: auth.user.id,
        kind: "check",
        provider: provider.id,
        model: provider.model,
        input_tokens: check.ok ? 10 : 0,
        output_tokens: check.ok ? 5 : 0,
        estimated_cost_usd: 0,
        tokens_estimated: check.ok,
      });
    }
    result = check.ok
      ? { ...base, model: provider.model, ok: true, generation: check.generation }
      : {
          ...base,
          model: provider.model,
          error: {
            kind: check.error.kind,
            httpStatus: check.error.status,
            reason: check.error.reason,
            message: describeProviderError(check.error),
            detail: check.error.detail,
          },
        };
    if (!check.ok) {
      logServer("error", "ai.check", {
        provider: provider.id,
        model: provider.model,
        ok: false,
        kind: check.error.kind,
        httpStatus: check.error.status,
        reason: check.error.reason,
        detail: check.error.detail,
        keyFormat: base.key.format,
        keyLength: base.key.length,
      });
    } else {
      logServer("info", "ai.check", {
        provider: provider.id,
        model: provider.model,
        ok: true,
        generation: check.generation,
        keyFormat: base.key.format,
      });
    }
  } catch {
    result = { ...base, error: { kind: "network", message: "Le fournisseur IA n'a pas répondu dans les 10 secondes." } };
    logServer("error", "ai.check", { provider: cfg.provider, model: cfg.model, ok: false, kind: "timeout" });
  } finally {
    clearTimeout(timer);
  }

  await logAction(auth.supabase, auth.user.id, "ai.check", result.ok ? "success" : "failure", {
    provider: result.provider,
    model: result.model,
    kind: result.error?.kind,
    reason: result.error?.reason,
    httpStatus: result.error?.httpStatus,
  });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
