import type { SearchMode } from '@/lib/agent/types';
import { isNativeSearchMode } from '@/lib/search/providers/types';

const FOLLOW_UP_WITH_SEARCH = 'Write the final answer. Cite sources inline as [n].';

// What the model wrote before calling tools is cleared from the reply, so the
// round after them writes the whole answer.
const FOLLOW_UP_DEFAULT = 'Write your reply using the tool results above.';

// A round that only wrote memory keeps its text on screen, so the round after
// it adds to that text: writing the answer again would show it twice.
const FOLLOW_UP_CONTINUE =
  'Your reply above is already shown to the user; do not repeat it. If it is unfinished, continue it. If a tool result above reports an error, correct the call. Otherwise write nothing.';

export function followUpPrompt(args: {
  searchEnabled: boolean;
  searchProvider: SearchMode;
  /** The reply's text stays on screen and the next round adds to it. */
  continuing?: boolean;
}): string {
  if (args.continuing) return FOLLOW_UP_CONTINUE;
  // Only tool-based search produces the numbered sources this prompt cites;
  // provider-native search grounds the answer inside the model call instead.
  if (args.searchEnabled && !isNativeSearchMode(args.searchProvider)) return FOLLOW_UP_WITH_SEARCH;
  return FOLLOW_UP_DEFAULT;
}
