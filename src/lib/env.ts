export function getPublicOpenRouterKey(): string | undefined {
  return process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
}

export function hasBraveKey(): boolean {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY);
}

