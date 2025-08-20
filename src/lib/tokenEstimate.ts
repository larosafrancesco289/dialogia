// Naive token estimator (rough approx: 4 chars per token)
export function estimateTokens(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const chars = text.length;
  return Math.max(1, Math.round(chars / 4));
}

