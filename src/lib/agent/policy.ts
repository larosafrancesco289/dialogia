import type { PlanTurnResult, SearchProvider, SearchResult } from '@/lib/agent/types';

export const MAX_PLANNING_ROUNDS = 3;

export const DEFAULT_BASE_SYSTEM = `You are a thoughtful assistant engaged in natural conversation. Respond directly and personally, writing as you would speak to a friend—clear, warm, and genuine.

Avoid over-formatting. Use headers, bullet points, and code blocks only when they genuinely help. Most responses should flow as natural prose.

Be honest about uncertainty. If you don't know something, say so rather than guessing. Ask for clarification when the request is ambiguous.

Focus on being helpful, not comprehensive. Answer what was asked, then stop. Offer follow-up only if it adds real value.`;

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

export function shouldAppendSources(results: SearchResult[] | undefined): boolean {
  return Array.isArray(results) && results.length > 0;
}

export function shouldShortCircuitTutor(result: PlanTurnResult): boolean {
  return result.usedTutorContentTool && !result.hasSearchResults;
}
