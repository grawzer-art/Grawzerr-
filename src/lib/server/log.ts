import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActionLogEntry } from "@/lib/types";

/** Appends an entry to the user's activity log. Never throws: logging must not break a request. */
export async function logAction(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  status: ActionLogEntry["status"],
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("action_log").insert({ user_id: userId, action, status, detail });
  } catch {
    // ignore
  }
}
