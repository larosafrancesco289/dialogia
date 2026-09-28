// Module: search/providers/openrouter
// Responsibility: Tool-based search that needs no key beyond the OpenRouter one
// the person already chats with.
//
// Searches go through OpenRouter's web plugin and are billed to that key; pages
// are read through Jina Reader, which needs no key at all. This is not
// provider-native search: the model calls `web_search` and `web_fetch` as tools,
// when and as often as it decides to.

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
import { OPENROUTER_KEY_REF } from '@/lib/transport/endpoints';
import { err, ok } from '@/lib/utils/result';

// Distinct from 'openrouter', which names provider-native search.
const OPENROUTER_SEARCH_PROVIDER_ID = 'openrouter-search';

function describeSearchStatus(status: number): string {
  if (status === 401 || status === 403) {
    return 'OpenRouter did not accept the key. Check it in Settings.';
  }
  if (status === 402) return 'The OpenRouter account is out of credit.';
  if (status === 429) return 'OpenRouter is limiting requests right now. Try again in a moment.';
  if (status >= 500) return 'OpenRouter is having trouble right now. Try again later.';
  return 'OpenRouter could not run this search.';
}

function describeReadStatus(status: number): string {
  if (status === 429) return 'The free page reader is busy. Try again in a minute.';
  if (status === 451) return 'The page reader is not allowed to open this page.';
  if (status >= 500) return 'The page reader could not open this page.';
  return 'Could not read this page.';
}

async function search(args: NormalizedSearchArgs, ctx: SearchContext): Promise<SearchOutcome> {
  if (!ctx.apiKey) return err(NOTICE_MISSING_SEARCH_KEY, { results: [] });
  const api = await import('@/lib/search/api/openrouterSearch');
  try {
    const results = await api.runOpenRouterSearch(args, {
      apiKey: ctx.apiKey,
      signal: ctx.signal,
    });
    return ok({ results });
  } catch (error: unknown) {
    return err(
      describeSearchFailure(error, {
        describeStatus: describeSearchStatus,
        unreachable: 'Could not reach OpenRouter.',
      }),
      { results: [] },
    );
  }
}

async function fetchPage(args: NormalizedFetchArgs, ctx: SearchContext): Promise<FetchOutcome> {
  const api = await import('@/lib/search/api/jina');
  try {
    const results = await api.runJinaRead(args, { signal: ctx.signal });
    return ok({ results });
  } catch (error: unknown) {
    return err(
      describeSearchFailure(error, {
        describeStatus: describeReadStatus,
        unreachable: 'Could not reach the page reader.',
      }),
      { results: [] },
    );
  }
}

export const openRouterSearchProvider: SearchProvider = {
  id: OPENROUTER_SEARCH_PROVIDER_ID,
  label: 'OpenRouter search',
  requiresKey: true,
  keyRef: OPENROUTER_KEY_REF,
  usesModelKey: true,
  search,
  fetchPage,
};
