import type { SearchMode } from '@/lib/agent/types';
import { isNativeSearchMode } from '@/lib/search/providers/types';

const FOLLOW_UP_WITH_SEARCH = 'Write the final answer. Cite sources inline as [n].';

// What the model wrote before calling tools is cleared from the reply, so the
// round after them writes the whole answer.
const FOLLOW_UP_DEFAULT = 'Write your reply using the tool results above.';

export function followUpPrompt(args: {
  searchEnabled: boolean;
  searchProvider: SearchMode;
}): string {
  // Only tool-based search produces the numbered sources this prompt cites;
  // provider-native search grounds the answer inside the model call instead.
  if (args.searchEnabled && !isNativeSearchMode(args.searchProvider)) return FOLLOW_UP_WITH_SEARCH;
  return FOLLOW_UP_DEFAULT;
}
