/**
 * Spending guard. Pure logic, so it can be unit-tested; the chat route feeds
 * it a usage snapshot read from the database before every AI call.
 */

export interface UsageSnapshot {
  requestsLast24h: number;
  tokensLast24h: number;
  requestsLastMinute: number;
  costThisMonthUsd: number;
}

export interface BudgetLimits {
  monthlyBudgetUsd: number;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  perMinuteLimit: number;
}

export type BudgetBlockCode =
  | "paid_provider_without_budget"
  | "monthly_budget_reached"
  | "would_exceed_budget"
  | "rate_limited"
  | "daily_requests_reached"
  | "daily_tokens_reached";

export interface BudgetDecision {
  allowed: boolean;
  code?: BudgetBlockCode;
  message?: string;
  warnings: string[];
}

export function checkBudget(
  usage: UsageSnapshot,
  limits: BudgetLimits,
  opts: { paid: boolean; worstCaseCostUsd: number },
): BudgetDecision {
  const warnings: string[] = [];
  const block = (code: BudgetBlockCode, message: string): BudgetDecision => ({
    allowed: false,
    code,
    message,
    warnings,
  });

  if (opts.paid) {
    if (limits.monthlyBudgetUsd <= 0) {
      return block(
        "paid_provider_without_budget",
        "Le fournisseur configuré est payant et aucun budget mensuel n'est défini (JARVIS_MONTHLY_BUDGET_USD=0). Aucune requête payante n'est envoyée sans votre accord explicite.",
      );
    }
    if (usage.costThisMonthUsd >= limits.monthlyBudgetUsd) {
      return block(
        "monthly_budget_reached",
        `Budget mensuel atteint (${usage.costThisMonthUsd.toFixed(2)} $ sur ${limits.monthlyBudgetUsd.toFixed(2)} $). Les requêtes payantes sont suspendues jusqu'au mois prochain.`,
      );
    }
    if (usage.costThisMonthUsd + opts.worstCaseCostUsd > limits.monthlyBudgetUsd) {
      return block(
        "would_exceed_budget",
        "Cette requête risquerait de dépasser le budget mensuel restant. Elle n'a pas été envoyée.",
      );
    }
    if (usage.costThisMonthUsd >= limits.monthlyBudgetUsd * 0.8) {
      warnings.push(
        `Attention : ${Math.round((usage.costThisMonthUsd / limits.monthlyBudgetUsd) * 100)} % du budget mensuel est consommé.`,
      );
    }
  }

  if (limits.perMinuteLimit > 0 && usage.requestsLastMinute >= limits.perMinuteLimit) {
    return block("rate_limited", "Trop de requêtes en une minute. Patientez quelques secondes.");
  }
  if (limits.dailyRequestLimit > 0 && usage.requestsLast24h >= limits.dailyRequestLimit) {
    return block(
      "daily_requests_reached",
      `Plafond de ${limits.dailyRequestLimit} requêtes sur 24 h atteint. Ce garde-fou se règle avec JARVIS_DAILY_REQUEST_LIMIT.`,
    );
  }
  if (limits.dailyTokenLimit > 0 && usage.tokensLast24h >= limits.dailyTokenLimit) {
    return block(
      "daily_tokens_reached",
      `Plafond de ${limits.dailyTokenLimit.toLocaleString("fr-FR")} jetons sur 24 h atteint. Ce garde-fou se règle avec JARVIS_DAILY_TOKEN_LIMIT.`,
    );
  }
  if (limits.dailyRequestLimit > 0 && usage.requestsLast24h >= limits.dailyRequestLimit * 0.8) {
    warnings.push(`${usage.requestsLast24h} requêtes sur ${limits.dailyRequestLimit} utilisées sur 24 h.`);
  }
  if (limits.dailyTokenLimit > 0 && usage.tokensLast24h >= limits.dailyTokenLimit * 0.8) {
    warnings.push("Plus de 80 % du plafond quotidien de jetons est consommé.");
  }
  return { allowed: true, warnings };
}

export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Keeps the most recent turns that fit a character budget (oldest dropped first). */
export function trimHistory<T extends { content: string }>(turns: T[], maxChars: number): T[] {
  const kept: T[] = [];
  let total = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    total += turns[i].content.length;
    if (total > maxChars && kept.length > 0) break;
    kept.unshift(turns[i]);
  }
  return kept;
}

/**
 * Makes a history acceptable to every provider: starts with a user turn,
 * alternates roles (consecutive same-role turns are merged), skips empty turns.
 */
export function normalizeTurns(
  turns: { role: "user" | "assistant"; content: string }[],
): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns) {
    const content = t.content.trim();
    if (!content) continue;
    if (out.length === 0 && t.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += `\n\n${content}`;
    else out.push({ role: t.role, content });
  }
  return out;
}
