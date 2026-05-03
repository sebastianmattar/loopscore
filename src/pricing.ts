import type { ModelPricing, TokenUsage } from "./types.js";

export function getTotalTokenUsage(
  tokenUsage: TokenUsage | null,
): number | null {
  if (!tokenUsage) return null;

  const inputTokens = tokenUsage.inputTokens ?? 0;
  const outputTokens = tokenUsage.outputTokens ?? 0;
  const total = inputTokens + outputTokens;

  return total > 0 ? total : null;
}

export function estimateFlatTokenCost(
  tokenCount: number,
  costPerMillionTokens?: number,
): number | null {
  if (costPerMillionTokens == null) return null;
  return +((tokenCount / 1_000_000) * costPerMillionTokens).toFixed(6);
}

export function estimateModelTokenCost(
  tokenUsage: TokenUsage | null,
  pricing?: ModelPricing,
): number | null {
  if (!tokenUsage || !pricing) return null;

  const inputTokens = tokenUsage.inputTokens ?? 0;
  const outputTokens = tokenUsage.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  if (totalTokens === 0) return null;

  const inputCost =
    (inputTokens / 1_000_000) * pricing.inputCostPerMillionTokens;
  const outputCost =
    (outputTokens / 1_000_000) * pricing.outputCostPerMillionTokens;

  return +(inputCost + outputCost).toFixed(6);
}
