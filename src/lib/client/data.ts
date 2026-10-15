"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_SETTINGS } from "@/lib/personality";
import type {
  ActionLogEntry,
  Conversation,
  JarvisSettings,
  Memory,
  MemoryCategory,
  MemoryStatus,
  Message,
  UsageEvent,
} from "@/lib/types";

/**
 * Browser data access. Every query runs with the signed-in user's session and
 * is filtered by Row Level Security in the database, so a user only ever
 * reaches their own rows.
 */

async function uid(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Session expirée. Reconnectez-vous.");
  return id;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function log(sb: SupabaseClient, action: string, status: ActionLogEntry["status"], detail = {}) {
  try {
    await sb.from("action_log").insert({ user_id: await uid(sb), action, status, detail });
  } catch {
    // logging never blocks the user
  }
}

// ── Settings ──────────────────────────────────────────────────
export async function loadSettings(sb: SupabaseClient): Promise<Omit<JarvisSettings, "user_id">> {
  const row = check(await sb.from("jarvis_settings").select("*").maybeSingle()) as JarvisSettings | null;
  return { ...DEFAULT_SETTINGS, ...(row ?? {}) };
}

export async function saveSettings(sb: SupabaseClient, settings: Omit<JarvisSettings, "user_id">) {
  const user_id = await uid(sb);
  check(await sb.from("jarvis_settings").upsert({ ...settings, user_id }).select("user_id"));
  await log(sb, "settings.update", "success");
}

// ── Conversations & messages ──────────────────────────────────
export async function listConversations(sb: SupabaseClient, limit = 50): Promise<Conversation[]> {
  return check(
    await sb.from("conversations").select("*").order("updated_at", { ascending: false }).limit(limit),
  ) as Conversation[];
}

export async function listMessages(sb: SupabaseClient, conversationId: string): Promise<Message[]> {
  return check(
    await sb
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500),
  ) as Message[];
}

export async function deleteConversation(sb: SupabaseClient, id: string) {
  check(await sb.from("conversations").delete().eq("id", id).select("id"));
  await log(sb, "conversation.delete", "success", { conversationId: id });
}

export async function renameConversation(sb: SupabaseClient, id: string, title: string) {
  check(await sb.from("conversations").update({ title: title.slice(0, 200) }).eq("id", id).select("id"));
}

// ── Memories ──────────────────────────────────────────────────
export async function listMemories(sb: SupabaseClient): Promise<Memory[]> {
  return check(
    await sb
      .from("memories")
      .select("*")
      .order("status", { ascending: true })
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(500),
  ) as Memory[];
}

export interface MemoryInput {
  content: string;
  category: MemoryCategory;
  importance: number;
  status: MemoryStatus;
}

export async function createMemory(sb: SupabaseClient, input: MemoryInput) {
  const user_id = await uid(sb);
  const row = check(
    await sb
      .from("memories")
      .insert({
        ...input,
        user_id,
        source: "user",
        last_confirmed_at: input.status === "confirmed" ? new Date().toISOString() : null,
      })
      .select("*")
      .single(),
  ) as Memory;
  await log(sb, "memory.create", "success", { memoryId: row.id, category: row.category });
  return row;
}

export async function updateMemory(sb: SupabaseClient, id: string, patch: Partial<MemoryInput>) {
  const extra = patch.status === "confirmed" ? { last_confirmed_at: new Date().toISOString() } : {};
  const row = check(
    await sb.from("memories").update({ ...patch, ...extra }).eq("id", id).select("*").single(),
  ) as Memory;
  await log(sb, "memory.update", "success", { memoryId: id, fields: Object.keys(patch) });
  return row;
}

export async function deleteMemory(sb: SupabaseClient, id: string) {
  check(await sb.from("memories").delete().eq("id", id).select("id"));
  await log(sb, "memory.delete", "success", { memoryId: id });
}

// ── Usage, log, account ───────────────────────────────────────
export async function listUsageSince(sb: SupabaseClient, sinceIso: string): Promise<UsageEvent[]> {
  return check(
    await sb
      .from("usage_events")
      .select("*")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20000),
  ) as UsageEvent[];
}

export async function listActionLog(sb: SupabaseClient, limit = 100): Promise<ActionLogEntry[]> {
  return check(
    await sb.from("action_log").select("*").order("created_at", { ascending: false }).limit(limit),
  ) as ActionLogEntry[];
}

export async function countRows(sb: SupabaseClient, table: "conversations" | "messages" | "memories") {
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Irreversibly deletes every row belonging to the signed-in user. */
export async function deleteAllMyData(sb: SupabaseClient) {
  const { error } = await sb.rpc("jarvis_delete_my_data");
  if (error) throw new Error(error.message);
}
