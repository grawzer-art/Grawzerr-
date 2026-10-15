/**
 * Price table in USD per million tokens, used only to *estimate* spend so the
 * budget guard can stop before an unexpected bill. Unknown paid models fall
 * back to a deliberately pessimistic price: overestimating is the safe error.
 */

export interface Price {
  inputPerMTok: number;
  outputPerMTok: number;
}

const KNOWN_PRICES: Record<string, Price> = {
  // Anthropic first-party API rates.
  "claude-fable-5-1": { inputPerMTok: 10, outputPerMTok: 50 },
  "claude-opus-5-5": { inputPerMTok: 4, outputPerMTok: 20 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-haiku-5-5": { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

export const PESSIMISTIC_PRICE: Price = { inputPerMTok: 15, outputPerMTok: 75 };

export function priceFor(model: string, paid: boolean): Price {
  if (!paid) return { inputPerMTok: 0, outputPerMTok: 0 };
  return KNOWN_PRICES[model] ?? PESSIMISTIC_PRICE;
}

export function estimateCostUsd(
  model: string,
  paid: boolean,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = priceFor(model, paid);
  const cost = (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Rough token estimate (~4 characters per token) when a provider reports no usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
