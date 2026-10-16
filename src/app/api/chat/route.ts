import { z } from "zod";

import { estimateCostUsd, estimateTokens } from "@/lib/ai/pricing";
import { createProvider } from "@/lib/ai/registry";
import { ProviderError, describeKey, describeProviderError } from "@/lib/ai/types";
import { checkBudget, normalizeTurns, trimHistory } from "@/lib/budget";
import { aiConfig, budgetConfig } from "@/lib/config";
import { MemoryTagFilter, sameMemory } from "@/lib/memory-suggestions";
import { DEFAULT_SETTINGS, buildSystemPrompt } from "@/lib/personality";
import { isSameOrigin } from "@/lib/server/http";
import { logAction } from "@/lib/server/log";
import { logServer } from "@/lib/server/logger";
import { readUsageSnapshot } from "@/lib/server/usage";
import { requireUser } from "@/lib/supabase/server";
import { detectTone } from "@/lib/tone";
import type { ChatStreamEvent, JarvisSettings, Memory, MemoryCategory } from "@/lib/types";

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
    logServer("warn", "chat.ai_not_configured", { provider: cfg.provider, key: describeKey(cfg.apiKey).format });
    return jsonError(
      503,
      "ai_not_configured",
      `Aucun fournisseur IA n'est configuré. Ajoutez la clé ${cfg.provider.toUpperCase()} dans les variables d'environnement Vercel (voir docs/CONFIGURATION.md).`,
    );
  }
  // Gemini counts its internal "thinking" in maxOutputTokens: leave it room (free tier, no cost).
  // Groq's free tier allows ~8k tokens/minute, so its replies stay at 2048.
  const maxTokens = cfg.provider === "anthropic" ? 4096 : cfg.provider === "gemini" ? 8192 : 2048;

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
    // Pending suggestions are read too, only to avoid proposing them twice.
    supabase
      .from("memories")
      .select("content, category, importance, expires_at, status")
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(300),
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
  const knownMemories = (memoriesRes.data ?? []) as Pick<
    Memory,
    "content" | "category" | "importance" | "expires_at" | "status"
  >[];
  const memories = knownMemories
    .filter((m) => m.status === "confirmed")
    .filter((m) => !m.expires_at || Date.parse(m.expires_at) > now.getTime())
    .slice(0, 80);

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
    logServer("warn", "chat.blocked", { code: decision.code, provider: cfg.provider, model: cfg.model });
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

      const memoryTags = new MemoryTagFilter();
      let text = "";
      const emit = (chunk: string) => {
        if (!chunk) return;
        text += chunk;
        send({ type: "delta", text: chunk });
      };
      let usage: { inputTokens: number; outputTokens: number } | null = null;
      let stop = "end";
      let failure: {
        code: string;
        message: string;
        reason?: string;
        detail?: string;
        status?: number;
        billed: boolean;
      } | null = null;
      const startedAt = Date.now();

      try {
        for await (const ev of provider.stream({ system, messages: turns, maxTokens, signal: request.signal })) {
          if (ev.type === "text") {
            emit(memoryTags.push(ev.text));
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
          failure = {
            code: `provider_${err.kind}`,
            message: describeProviderError(err),
            reason: err.reason,
            detail: err.detail,
            status: err.status,
            // A request rejected with an HTTP error before any output is not billed.
            billed: text.length > 0 || err.status === undefined,
          };
          logServer("error", "ai.error", {
            provider: provider.id,
            model: provider.model,
            kind: err.kind,
            httpStatus: err.status,
            reason: err.reason,
            detail: err.detail,
            keyFormat: describeKey(cfg.apiKey).format,
            keyLength: cfg.apiKey.length,
            partialChars: text.length,
          });
        } else {
          failure = { code: "internal_error", message: "Erreur inattendue pendant la réponse.", billed: true };
          logServer("error", "chat.internal_error", {
            provider: provider.id,
            model: provider.model,
            error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          });
        }
      }

      emit(memoryTags.flush());

      // Usage is recorded even for interrupted or failed calls: tokens may have been billed.
      const notBilled = failure !== null && !failure.billed;
      const estimated = usage === null && !notBilled;
      const inputTokens = usage?.inputTokens ?? (notBilled ? 0 : inputEstimate);
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
      // Proposed memories wait for the user's confirmation: never stored as facts.
      let memorySuggestions: { id: string; content: string; category: MemoryCategory }[] = [];
      const proposals = memoryTags.suggestions.filter(
        (s) =>
          !knownMemories.some((m) => (m.status === "confirmed" || m.status === "suggested") && sameMemory(m.content, s.content)),
      );
      if (!failure && proposals.length > 0) {
        const { data } = await supabase
          .from("memories")
          .insert(
            proposals.map((s) => ({
              user_id: user.id,
              content: s.content,
              category: s.category,
              importance: s.importance,
              status: "suggested",
              source: "assistant",
            })),
          )
          .select("id, content, category");
        memorySuggestions = (data ?? []) as typeof memorySuggestions;
        if (memorySuggestions.length > 0) {
          await logAction(supabase, user.id, "memory.suggest", "success", {
            conversationId: convId,
            count: memorySuggestions.length,
          });
        }
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
        reason: failure?.reason,
        httpStatus: failure?.status,
        inputTokens,
        outputTokens,
        estimatedCostUsd: costUsd,
      });

      if (!failure) {
        logServer("info", "ai.reply", {
          provider: provider.id,
          model: provider.model,
          stop,
          ms: Date.now() - startedAt,
          inputTokens,
          outputTokens,
          tokensEstimated: estimated,
        });
      }

      if (failure) {
        send({
          type: "error",
          code: failure.code,
          message: failure.message,
          reason: failure.reason,
          detail: failure.detail,
        });
      } else {
        send({
          type: "done",
          messageId,
          stop,
          usage: { inputTokens, outputTokens, estimated, costUsd },
          warnings: decision.warnings,
          ...(memorySuggestions.length > 0 ? { memorySuggestions } : {}),
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
