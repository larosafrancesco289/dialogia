export function getPublicOpenRouterKey(): string | undefined {
  return process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
}

export function hasBraveKey(): boolean {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY);
}

export function useOpenRouterProxy(): boolean {
  return process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
}

// Default for the ZDR-only preference; on unless explicitly disabled
export function defaultZdrOnly(): boolean {
  const v = process.env.NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT;
  if (v == null) return true;
  return String(v).toLowerCase() !== 'false';
}
