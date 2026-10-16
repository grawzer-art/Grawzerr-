import { audioExtension, transcribe } from "@/lib/ai/transcribe";
import { ProviderError, describeProviderError } from "@/lib/ai/types";
import { checkBudget } from "@/lib/budget";
import { budgetConfig, transcriptionConfig } from "@/lib/config";
import { isSameOrigin } from "@/lib/server/http";
import { logServer } from "@/lib/server/logger";
import { readUsageSnapshot } from "@/lib/server/usage";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Vercel rejects request bodies above 4.5 MB; 30 s of compressed speech is far below. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export interface TranscribeResponse {
  text?: string;
  code?: string;
  message?: string;
  reason?: string;
  detail?: string;
}

function fail(status: number, code: string, message: string, extra: Partial<TranscribeResponse> = {}) {
  return Response.json({ code, message, ...extra } satisfies TranscribeResponse, { status });
}

/**
 * Speech-to-text for the voice mode. The audio is forwarded to Groq's Whisper
 * (free tier) and never stored: only the resulting text is returned, and it
 * becomes a chat message only when the client sends it.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "forbidden_origin", "Origine de la requête refusée.");
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.status, auth.code, auth.message);
  const { supabase, user } = auth;

  const cfg = transcriptionConfig();
  if (!cfg.configured) {
    return fail(
      503,
      "transcription_not_configured",
      "La transcription vocale utilise Whisper chez Groq : ajoutez GROQ_API_KEY dans Vercel puis redéployez.",
    );
  }

  let audio: Blob;
  try {
    const value = (await request.formData()).get("audio");
    if (!(value instanceof Blob)) throw new Error("missing");
    audio = value;
  } catch {
    return fail(400, "invalid_audio", "Aucun enregistrement reçu.");
  }
  if (audio.size === 0) return fail(400, "invalid_audio", "Enregistrement vide.");
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, "audio_too_large", "Enregistrement trop long (30 secondes maximum).");
  const ext = audioExtension(audio.type);
  if (!ext) return fail(415, "unsupported_audio", "Format audio non pris en charge par la transcription.");

  // Same guard as the chat: per-minute and daily caps (Groq's free tier is 0 €).
  const now = new Date();
  let snapshot;
  try {
    snapshot = await readUsageSnapshot(supabase, user.id, now);
  } catch {
    return fail(500, "usage_unavailable", "Impossible de vérifier la consommation : transcription annulée par prudence.");
  }
  const decision = checkBudget(snapshot, budgetConfig(), { paid: false, worstCaseCostUsd: 0 });
  if (!decision.allowed) {
    logServer("warn", "transcribe.blocked", { code: decision.code });
    return fail(429, decision.code ?? "blocked", decision.message ?? "Requête bloquée par les garde-fous.");
  }

  const startedAt = Date.now();
  let failure: ProviderError | null = null;
  let text = "";
  let durationSec: number | null = null;
  try {
    ({ text, durationSec } = await transcribe({
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      audio,
      filename: `audio.${ext}`,
      signal: request.signal,
    }));
  } catch (err) {
    failure = err instanceof ProviderError ? err : new ProviderError("unavailable", "unexpected error");
  }

  await supabase.from("usage_events").insert({
    user_id: user.id,
    kind: "transcribe",
    provider: "groq",
    model: cfg.model,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    tokens_estimated: false,
  });

  if (failure) {
    logServer("error", "ai.error", {
      provider: "groq",
      model: cfg.model,
      operation: "transcribe",
      kind: failure.kind,
      httpStatus: failure.status,
      reason: failure.reason,
      detail: failure.detail,
    });
    return fail(502, `provider_${failure.kind}`, `Transcription impossible. ${describeProviderError(failure)}`, {
      reason: failure.reason,
      detail: failure.detail,
    });
  }

  logServer("info", "ai.transcribe", {
    provider: "groq",
    model: cfg.model,
    ms: Date.now() - startedAt,
    bytes: audio.size,
    audioSec: durationSec,
    chars: text.length,
  });
  return Response.json({ text } satisfies TranscribeResponse, { headers: { "cache-control": "no-store" } });
}
