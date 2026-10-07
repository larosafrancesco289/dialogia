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

import type {
  FetchOutcome,
  NormalizedFetchArgs,
  NormalizedSearchArgs,
  SearchContext,
  SearchOutcome,
  SearchProvider,
} from '@/lib/search/providers/types';
import { describeSearchFailure } from '@/lib/search/providers/failure';
import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { err, ok } from '@/lib/utils/result';
import { t } from '@/lib/i18n';

export const TAVILY_PROVIDER_ID = 'tavily';

// Tavily's statuses, in the words the ledger shows. 432 and 433 are its plan
// and pay-as-you-go limits.
function describeStatus(status: number, attempt: 'search' | 'fetch'): string {
  if (status === 401 || status === 403) return t('searchError.tavily.key');
  if (status === 429) return t('searchError.tavily.limited');
  if (status === 432 || status === 433) return t('searchError.tavily.plan');
  if (status >= 500) return t('searchError.tavily.trouble');
  return t(attempt === 'search' ? 'searchError.tavily.search' : 'searchError.tavily.fetch');
}

function describeFailure(error: unknown, attempt: 'search' | 'fetch'): string | undefined {
  return describeSearchFailure(error, {
    describeStatus: (status) => describeStatus(status, attempt),
    unreachable: t('searchError.unreachable', { service: 'Tavily' }),
  });
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
    return err(describeFailure(error, 'search'), { results: [] });
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
    return err(describeFailure(error, 'fetch'), { results: [] });
  }
}

export const tavilySearchProvider: SearchProvider = {
  id: TAVILY_PROVIDER_ID,
  label: 'Tavily',
  requiresKey: true,
  search,
  fetchPage,
};
