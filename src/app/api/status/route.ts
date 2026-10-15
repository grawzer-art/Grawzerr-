import { PROVIDER_PRESETS } from "@/lib/ai/presets";
import { aiConfig, allowedEmails, budgetConfig, supabasePublicConfig } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Configuration diagnostics. Anonymous callers only learn which pieces are
 * configured (booleans); signed-in callers also get provider, model and limits.
 * Secrets are never returned.
 */
export async function GET() {
  const supa = supabasePublicConfig();
  const ai = aiConfig();
  const base = {
    supabaseConfigured: supa.configured,
    aiConfigured: ai.configured,
    allowlistConfigured: allowedEmails().length > 0,
  };

  const supabase = await getServerSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!data.user) return Response.json({ ...base, authenticated: false }, { headers: { "cache-control": "no-store" } });

  const preset = PROVIDER_PRESETS[ai.provider];
  return Response.json(
    {
      ...base,
      authenticated: true,
      email: data.user.email,
      allowed: allowedEmails().includes((data.user.email ?? "").toLowerCase()),
      ai: {
        provider: ai.provider,
        label: preset.label,
        model: ai.model,
        paid: ai.paid,
        note: preset.note,
        keyEnv: preset.apiKeyEnv,
      },
      budget: budgetConfig(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
