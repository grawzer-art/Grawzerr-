import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { isEmailAllowed, supabasePublicConfig } from "@/lib/config";

/** Supabase client bound to the request cookies (route handlers, server components). */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  const { url, key, configured } = supabasePublicConfig();
  if (!configured) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes them.
        }
      },
    },
  });
}

export type AuthResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; status: 401 | 403 | 503; code: string; message: string };

/** Verifies the session with the Auth server and enforces the e-mail allowlist. */
export async function requireUser(): Promise<AuthResult> {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return { ok: false, status: 503, code: "supabase_not_configured", message: "Supabase n'est pas configuré." };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, code: "unauthenticated", message: "Session expirée. Reconnectez-vous." };
  }
  if (!isEmailAllowed(data.user.email)) {
    return {
      ok: false,
      status: 403,
      code: "not_allowed",
      message: "Ce compte n'est pas autorisé à utiliser JARVIS (JARVIS_ALLOWED_EMAILS).",
    };
  }
  return { ok: true, supabase, user: data.user };
}
