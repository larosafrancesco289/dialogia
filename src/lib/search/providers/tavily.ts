// Module: search/providers/tavily
// Responsibility: The Tavily implementation of the tool-based search interface.
//
// Calls api.tavily.com straight from the page with the user's own key. Verified
// July 2026 that it answers the CORS preflight by reflecting the request origin
// and allowing the `authorization` header.
//
// The descriptor is eager (the registry must be complete before any settings UI
// or turn reads it) but the request code is behind a dynamic import, so Tavily's
// payload builders stay out of the boot bundle.

import { isApiError } from '@/lib/api/errors';
import type {
  FetchOutcome,
  NormalizedFetchArgs,
  NormalizedSearchArgs,
  SearchContext,
  SearchOutcome,
  SearchProvider,
} from '@/lib/search/providers/types';
import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { err, ok } from '@/lib/utils/result';

export const TAVILY_PROVIDER_ID = 'tavily';

function describeFailure(error: unknown): string {
  if (isApiError(error)) {
    const detail = typeof error.detail === 'string' && error.detail.trim() ? error.detail : '';
    return detail || error.code;
  }
  return error instanceof Error ? error.message : 'Network error';
}

async function search(args: NormalizedSearchArgs, ctx: SearchContext): Promise<SearchOutcome> {
  if (!ctx.apiKey) return err(NOTICE_MISSING_SEARCH_KEY, { results: [] });
  const api = await import('@/lib/search/api/tavily');
  try {
    const results = await api.runTavilySearchDirect(args, {
      apiKey: ctx.apiKey,
      signal: ctx.signal,
    });
    return ok({ results });
  } catch (error: unknown) {
    return err(describeFailure(error), { results: [] });
  }
}

async function fetchPage(args: NormalizedFetchArgs, ctx: SearchContext): Promise<FetchOutcome> {
  if (!ctx.apiKey) return err(NOTICE_MISSING_SEARCH_KEY, { results: [] });
  const api = await import('@/lib/search/api/tavily');
  try {
    const results = await api.runTavilyExtractDirect(args, {
      apiKey: ctx.apiKey,
      signal: ctx.signal,
    });
    return ok({ results });
  } catch (error: unknown) {
    return err(describeFailure(error), { results: [] });
  }
}

export const tavilySearchProvider: SearchProvider = {
  id: TAVILY_PROVIDER_ID,
  label: 'Tavily',
  requiresKey: true,
  search,
  fetchPage,
};
