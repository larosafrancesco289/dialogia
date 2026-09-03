// Module: search/providers/types
// Responsibility: The pluggable tool-based search interface.
//
// Two mechanisms are deliberately kept apart. *Provider-native* search
// (OpenRouter's `web` plugin, which the Anthropic transport reinterprets as its
// own `web_search` server tool) is a field of the model request, needs no extra
// key, and is not a `SearchProvider`. *Tool-based* search runs as a real
// `web_search`/`web_fetch` tool call against a third-party API and is what this
// interface describes.

import { NATIVE_SEARCH_MODE, type SearchMode } from '@/lib/types/enums';
import type { WebFetchArgs, WebSearchArgs } from '@/lib/search/args';
import type { SearchResult } from '@/lib/search/types';
import type { Result } from '@/lib/utils/result';

export type NormalizedSearchArgs = WebSearchArgs;
export type NormalizedFetchArgs = WebFetchArgs;

export type FetchedPage = {
  url?: string;
  raw_content?: string;
  images?: string[];
  favicon?: string;
};

export type SearchContext = {
  /** Resolved from the key store; absent when the user has not added one. */
  apiKey?: string;
  signal?: AbortSignal;
};

export type SearchOutcome = Result<{ results: SearchResult[] }, string | undefined>;
export type FetchOutcome = Result<{ results: FetchedPage[] }, string | undefined>;

export type SearchProvider = {
  id: string;
  label: string;
  requiresKey: boolean;
  /** Key-store reference; defaults to the provider id. */
  keyRef?: string;
  search(args: NormalizedSearchArgs, ctx: SearchContext): Promise<SearchOutcome>;
  /** Present only when the provider can read a single page; gates `web_fetch`. */
  fetchPage?(args: NormalizedFetchArgs, ctx: SearchContext): Promise<FetchOutcome>;
};

export { NATIVE_SEARCH_MODE };
export type { SearchMode };

export function isNativeSearchMode(mode?: SearchMode): boolean {
  return !mode || mode === NATIVE_SEARCH_MODE;
}
