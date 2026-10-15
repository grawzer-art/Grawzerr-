import { z } from "zod";

import { estimateCostUsd, estimateTokens } from "@/lib/ai/pricing";
import { createProvider } from "@/lib/ai/registry";
import { ProviderError, describeProviderError } from "@/lib/ai/types";
import { checkBudget, normalizeTurns, trimHistory } from "@/lib/budget";
import { aiConfig, budgetConfig } from "@/lib/config";
import { DEFAULT_SETTINGS, buildSystemPrompt } from "@/lib/personality";
import { logAction } from "@/lib/server/log";
import { readUsageSnapshot } from "@/lib/server/usage";
import { requireUser } from "@/lib/supabase/server";
import { detectTone } from "@/lib/tone";
import type { ChatStreamEvent, JarvisSettings, Memory } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_HISTORY_MESSAGES = 40;
const MAX_HISTORY_CHARS = 24_000;

const BodySchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(8000),
});

function jsonError(status: number, code: string, message: string) {
  return Response.json({ type: "error", code, message } satisfies ChatStreamEvent, { status });
}

/** Rejects cross-site requests (defence in depth on top of SameSite cookies). */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from some browsers omit it
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "Origine de la requête refusée.");
  const auth = await requireUser();
  if (!auth.ok) return jsonError(auth.status, auth.code, auth.message);
  const { supabase, user } = auth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "invalid_request", "Message vide ou trop long (8000 caractères maximum).");
  }

  const cfg = aiConfig();
  const provider = createProvider();
  if (!provider) {
    return jsonError(
      503,
      "ai_not_configured",
      `Aucun fournisseur IA n'est configuré. Ajoutez la clé ${cfg.provider.toUpperCase()} dans les variables d'environnement Vercel (voir docs/CONFIGURATION.md).`,
    );
  }
  const maxTokens = cfg.provider === "anthropic" ? 4096 : 2048;

  // ── Conversation ────────────────────────────────────────────────
  let conversationId = body.conversationId;
  let isNewConversation = false;
  let conversationSummary = "";
  if (conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, summary")
      .eq("id", conversationId)
      .maybeSingle();
    if (error || !data) return jsonError(404, "conversation_not_found", "Conversation introuvable.");
    conversationSummary = (data.summary as string) ?? "";
  }

  // ── Context: settings, memories, history ────────────────────────
  const [settingsRes, memoriesRes, historyRes] = await Promise.all([
    supabase.from("jarvis_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("memories")
      .select("content, category, importance, expires_at")
      .eq("status", "confirmed")
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(80),
    conversationId
      ? supabase
          .from("messages")
          .select("role, content, status")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(MAX_HISTORY_MESSAGES)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (settingsRes.error || memoriesRes.error || historyRes.error) {
    return jsonError(500, "database_error", "Lecture de la base de données impossible.");
  }

  const settings: Omit<JarvisSettings, "user_id"> = { ...DEFAULT_SETTINGS, ...(settingsRes.data ?? {}) };
  const now = new Date();
  const memories = ((memoriesRes.data ?? []) as (Pick<Memory, "content" | "category" | "importance"> & {
    expires_at: string | null;
  })[]).filter((m) => !m.expires_at || Date.parse(m.expires_at) > now.getTime());

  const tone = detectTone(body.message);
  const previous = ((historyRes.data ?? []) as { role: "user" | "assistant"; content: string; status: string }[])
    .reverse()
    .filter((m) => m.status !== "error");
  const turns = normalizeTurns(
    trimHistory([...previous, { role: "user" as const, content: body.message }], MAX_HISTORY_CHARS),
  );

  const system = buildSystemPrompt({
    settings,
    memories,
    conversationSummary,
    tone,
    now,
  });

  // ── Budget guard (fails closed) ─────────────────────────────────
  const limits = budgetConfig();
  let snapshot;
  try {
    snapshot = await readUsageSnapshot(supabase, user.id, now);
  } catch {
    return jsonError(500, "usage_unavailable", "Impossible de vérifier la consommation : requête annulée par prudence.");
  }
  const inputEstimate = estimateTokens(system) + turns.reduce((n, t) => n + estimateTokens(t.content), 0);
  const decision = checkBudget(snapshot, limits, {
    paid: cfg.paid,
    worstCaseCostUsd: estimateCostUsd(cfg.model, cfg.paid, inputEstimate, maxTokens),
  });
  if (!decision.allowed) {
    await logAction(supabase, user.id, "chat.blocked", "blocked", { code: decision.code });
    return jsonError(429, decision.code ?? "blocked", decision.message ?? "Requête bloquée par les garde-fous.");
  }

  // ── Persist the user message ────────────────────────────────────
  if (!conversationId) {
    const title = body.message.replace(/\s+/g, " ").slice(0, 60) + (body.message.length > 60 ? "…" : "");
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !data) return jsonError(500, "database_error", "Création de la conversation impossible.");
    conversationId = data.id as string;
    isNewConversation = true;
  }
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: body.message,
    tone: tone.tone,
  });
  if (insertError) return jsonError(500, "database_error", "Enregistrement du message impossible.");

  // ── Stream the answer ───────────────────────────────────────────
  const encoder = new TextEncoder();
  const convId = conversationId;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      send({
        type: "meta",
        conversationId: convId,
        tone: tone.tone,
        toneCues: tone.cues,
        provider: provider.id,
        model: provider.model,
      });

      let text = "";
      let usage: { inputTokens: number; outputTokens: number } | null = null;
      let stop = "end";
      let failure: { code: string; message: string } | null = null;

      try {
        for await (const ev of provider.stream({ system, messages: turns, maxTokens, signal: request.signal })) {
          if (ev.type === "text") {
            text += ev.text;
            send({ type: "delta", text: ev.text });
          } else if (ev.type === "usage") {
            usage = { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens };
          } else if (ev.type === "stop") {
            stop = ev.reason;
          }
        }
      } catch (err) {
        if (request.signal.aborted) {
          stop = "interrupted";
        } else if (err instanceof ProviderError) {
          failure = { code: `provider_${err.kind}`, message: describeProviderError(err) };
        } else {
          failure = { code: "internal_error", message: "Erreur inattendue pendant la réponse." };
        }
      }

      // Usage is recorded even for interrupted or failed calls: tokens may have been billed.
      const estimated = usage === null;
      const inputTokens = usage?.inputTokens ?? inputEstimate;
      const outputTokens = usage?.outputTokens ?? estimateTokens(text);
      const costUsd = estimateCostUsd(provider.model, cfg.paid, inputTokens, outputTokens);
      await supabase.from("usage_events").insert({
        user_id: user.id,
        kind: "chat",
        provider: provider.id,
        model: provider.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: costUsd,
        tokens_estimated: estimated,
      });

      let messageId: string | null = null;
      const status = failure ? "error" : stop === "interrupted" ? "interrupted" : "complete";
      const content =
        text.trim() ||
        (failure ? `⚠️ ${failure.message}` : stop === "refusal" ? "Je ne peux pas répondre à cette demande." : "");
      if (content) {
        const { data } = await supabase
          .from("messages")
          .insert({
            conversation_id: convId,
            user_id: user.id,
            role: "assistant",
            content,
            status,
            provider: provider.id,
            model: provider.model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          })
          .select("id")
          .single();
        messageId = (data?.id as string | undefined) ?? null;
      }
      // Bumps updated_at (trigger) so the conversation rises to the top of the history.
      await supabase.from("conversations").update({ archived: false }).eq("id", convId);
      await logAction(supabase, user.id, "chat.reply", failure ? "failure" : "success", {
        conversationId: convId,
        newConversation: isNewConversation,
        provider: provider.id,
        model: provider.model,
        stop,
        error: failure?.code,
        inputTokens,
        outputTokens,
        estimatedCostUsd: costUsd,
      });

      if (failure) {
        send({ type: "error", code: failure.code, message: failure.message });
      } else {
        send({
          type: "done",
          messageId,
          stop,
          usage: { inputTokens, outputTokens, estimated, costUsd },
          warnings: decision.warnings,
        });
      }
      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by a disconnect
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
