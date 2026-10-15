import { describe, expect, it } from "vitest";

import { PESSIMISTIC_PRICE, estimateCostUsd, estimateTokens, priceFor } from "@/lib/ai/pricing";

describe("pricing", () => {
  it("is free for free-tier providers", () => {
    expect(estimateCostUsd("gemini-flash-latest", false, 1e6, 1e6)).toBe(0);
  });
  it("uses known prices", () => {
    expect(estimateCostUsd("claude-haiku-5-5", true, 1_000_000, 1_000_000)).toBeCloseTo(0.6);
    expect(estimateCostUsd("claude-opus-5-5", true, 10_000, 1_000)).toBeCloseTo(0.06);
  });
  it("overestimates unknown paid models", () => {
    expect(priceFor("mystery-model", true)).toEqual(PESSIMISTIC_PRICE);
  });
  it("estimates tokens from characters", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});
