// Module: search/providers/tavily
// Responsibility: The Tavily implementation of the tool-based search interface.
//
// BYOK calls api.tavily.com straight from the page — verified July 2026 that it
// answers the CORS preflight by reflecting the request origin and allowing the
// `authorization` header. The hosted deployment keeps its own key server-side
// and routes through the gated `/api/tavily` proxy instead.
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
    // The proxy reports a missing server key this way; either side leaves the
    // user with the same next step.
    if (error.code === 'missing_env') return NOTICE_MISSING_SEARCH_KEY;
    return detail || error.code;
  }
  return error instanceof Error ? error.message : 'Network error';
}

async function search(args: NormalizedSearchArgs, ctx: SearchContext): Promise<SearchOutcome> {
  const api = await import('@/lib/search/api/tavily');
  try {
    if (ctx.apiKey) {
      const results = await api.runTavilySearchDirect(args, {
        apiKey: ctx.apiKey,
        signal: ctx.signal,
      });
      return ok({ results });
    }
    if (ctx.useProxy) {
      return ok({ results: await api.runTavilySearchProxy(args, { signal: ctx.signal }) });
    }
    return err(NOTICE_MISSING_SEARCH_KEY, { results: [] });
  } catch (error: unknown) {
    return err(describeFailure(error), { results: [] });
  }
}

async function fetchPage(args: NormalizedFetchArgs, ctx: SearchContext): Promise<FetchOutcome> {
  const api = await import('@/lib/search/api/tavily');
  try {
    if (ctx.apiKey) {
      const results = await api.runTavilyExtractDirect(args, {
        apiKey: ctx.apiKey,
        signal: ctx.signal,
      });
      return ok({ results });
    }
    if (ctx.useProxy) {
      return ok({ results: await api.runTavilyExtractProxy(args, { signal: ctx.signal }) });
    }
    return err(NOTICE_MISSING_SEARCH_KEY, { results: [] });
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
