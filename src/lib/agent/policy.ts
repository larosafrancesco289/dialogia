import type { PlanTurnResult } from '@/lib/agent/types';
import type { SearchResult } from '@/lib/search/types';

export const MAX_PLANNING_ROUNDS = 3;

export function shouldAppendSources(results: SearchResult[] | undefined): boolean {
  return Array.isArray(results) && results.length > 0;
}

export function shouldShortCircuitTutor(result: PlanTurnResult): boolean {
  return result.usedTutorContentTool && !result.hasSearchResults;
}
