import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { startOfMonthUtc, type UsageSnapshot } from "@/lib/budget";

/** Reads the usage counters the budget guard needs. Fails closed (throws) on database errors. */
export async function readUsageSnapshot(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<UsageSnapshot> {
  const dayAgo = now.getTime() - 24 * 3600 * 1000;
  const minuteAgo = now.getTime() - 60 * 1000;
  const monthStart = startOfMonthUtc(now).getTime();
  const since = new Date(Math.min(dayAgo, monthStart)).toISOString();

  const { data, error } = await supabase
    .from("usage_events")
    .select("input_tokens, output_tokens, estimated_cost_usd, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20000);
  if (error) throw new Error("usage_read_failed");

  const snap: UsageSnapshot = { requestsLast24h: 0, tokensLast24h: 0, requestsLastMinute: 0, costThisMonthUsd: 0 };
  for (const row of data ?? []) {
    const at = Date.parse(row.created_at as string);
    if (at >= dayAgo) {
      snap.requestsLast24h += 1;
      snap.tokensLast24h += (row.input_tokens as number) + (row.output_tokens as number);
    }
    if (at >= minuteAgo) snap.requestsLastMinute += 1;
    if (at >= monthStart) snap.costThisMonthUsd += Number(row.estimated_cost_usd);
  }
  return snap;
}
