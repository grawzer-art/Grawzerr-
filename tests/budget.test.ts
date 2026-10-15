import { describe, expect, it } from "vitest";

import { checkBudget, normalizeTurns, startOfMonthUtc, trimHistory, type BudgetLimits, type UsageSnapshot } from "@/lib/budget";

const limits: BudgetLimits = { monthlyBudgetUsd: 5, dailyRequestLimit: 100, dailyTokenLimit: 100_000, perMinuteLimit: 10 };
const zero: UsageSnapshot = { requestsLast24h: 0, tokensLast24h: 0, requestsLastMinute: 0, costThisMonthUsd: 0 };

describe("checkBudget", () => {
  it("allows a free provider with no budget", () => {
    expect(checkBudget(zero, { ...limits, monthlyBudgetUsd: 0 }, { paid: false, worstCaseCostUsd: 0 }).allowed).toBe(true);
  });

  it("blocks any paid provider while the monthly budget is 0", () => {
    const d = checkBudget(zero, { ...limits, monthlyBudgetUsd: 0 }, { paid: true, worstCaseCostUsd: 0.001 });
    expect(d).toMatchObject({ allowed: false, code: "paid_provider_without_budget" });
  });

  it("blocks when the monthly budget is reached or would be exceeded", () => {
    expect(checkBudget({ ...zero, costThisMonthUsd: 5 }, limits, { paid: true, worstCaseCostUsd: 0 }).code).toBe(
      "monthly_budget_reached",
    );
    expect(checkBudget({ ...zero, costThisMonthUsd: 4.95 }, limits, { paid: true, worstCaseCostUsd: 0.1 }).code).toBe(
      "would_exceed_budget",
    );
  });

  it("warns at 80 % of the monthly budget", () => {
    const d = checkBudget({ ...zero, costThisMonthUsd: 4.1 }, limits, { paid: true, worstCaseCostUsd: 0.01 });
    expect(d.allowed).toBe(true);
    expect(d.warnings.join(" ")).toMatch(/82 %/);
  });

  it("enforces per-minute, daily request and daily token caps", () => {
    expect(checkBudget({ ...zero, requestsLastMinute: 10 }, limits, { paid: false, worstCaseCostUsd: 0 }).code).toBe("rate_limited");
    expect(checkBudget({ ...zero, requestsLast24h: 100 }, limits, { paid: false, worstCaseCostUsd: 0 }).code).toBe(
      "daily_requests_reached",
    );
    expect(checkBudget({ ...zero, tokensLast24h: 100_000 }, limits, { paid: false, worstCaseCostUsd: 0 }).code).toBe(
      "daily_tokens_reached",
    );
  });

  it("treats a 0 cap as disabled", () => {
    const off = { ...limits, dailyRequestLimit: 0, dailyTokenLimit: 0, perMinuteLimit: 0 };
    const busy = { requestsLast24h: 1e6, tokensLast24h: 1e9, requestsLastMinute: 1e3, costThisMonthUsd: 0 };
    expect(checkBudget(busy, off, { paid: false, worstCaseCostUsd: 0 }).allowed).toBe(true);
  });
});

describe("history helpers", () => {
  it("keeps the most recent turns within the character budget", () => {
    const turns = ["a".repeat(50), "b".repeat(50), "c".repeat(50)].map((content) => ({ content }));
    expect(trimHistory(turns, 120).map((t) => t.content[0])).toEqual(["b", "c"]);
    // The latest turn is always kept even if it alone exceeds the budget.
    expect(trimHistory([{ content: "x".repeat(500) }], 10)).toHaveLength(1);
  });

  it("normalizes roles for every provider", () => {
    expect(
      normalizeTurns([
        { role: "assistant", content: "orphan" },
        { role: "user", content: "q1" },
        { role: "user", content: "q2" },
        { role: "assistant", content: "  " },
        { role: "assistant", content: "a" },
      ]),
    ).toEqual([
      { role: "user", content: "q1\n\nq2" },
      { role: "assistant", content: "a" },
    ]);
  });

  it("computes the UTC month start", () => {
    expect(startOfMonthUtc(new Date("2026-10-15T21:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
