import type { SearchProvider } from '@/lib/agent/types';

const FOLLOW_UP_WITH_SEARCH = 'Write the final answer. Cite sources inline as [n].';

const FOLLOW_UP_DEFAULT =
  'Continue the lesson concisely. Give brief guidance and a next step. Do not repeat items already rendered.';

export function followUpPrompt(args: {
  searchEnabled: boolean;
  searchProvider: SearchProvider;
}): string {
  if (args.searchEnabled && args.searchProvider === 'brave') return FOLLOW_UP_WITH_SEARCH;
  return FOLLOW_UP_DEFAULT;
}
