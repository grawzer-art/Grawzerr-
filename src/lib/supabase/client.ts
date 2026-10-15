"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// NEXT_PUBLIC_* values are inlined at build time.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

/** Browser Supabase client (singleton). Returns null when Supabase is not configured. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  client ??= createBrowserClient(URL, KEY);
  return client;
}
