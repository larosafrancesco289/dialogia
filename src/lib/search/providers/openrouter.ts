// Module: search/providers/openrouter
// Responsibility: Tool-based search that needs no key beyond the OpenRouter one
// the person already chats with.
//
// Searches go through OpenRouter's web plugin and are billed to that key; pages
// are read through Jina Reader, which needs no key at all. This is not
// provider-native search: the model calls `web_search` and `web_fetch` as tools,
// when and as often as it decides to.

import {
  hasReadableContent,
  type FetchOutcome,
  type NormalizedFetchArgs,
  type NormalizedSearchArgs,
  type SearchContext,
  type SearchOutcome,
  type SearchProvider,
} from '@/lib/search/providers/types';
import { describeSearchFailure } from '@/lib/search/providers/failure';
import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { OPENROUTER_KEY_REF } from '@/lib/transport/endpoints';
import { err, ok } from '@/lib/utils/result';
import { t } from '@/lib/i18n';

// Distinct from 'openrouter', which names provider-native search.
const OPENROUTER_SEARCH_PROVIDER_ID = 'openrouter-search';

function describeSearchStatus(status: number): string {
  if (status === 401 || status === 403) {
    return t('searchError.openrouter.key');
  }
  if (status === 402) return t('searchError.openrouter.credit');
  if (status === 429) return t('searchError.openrouter.limited');
  if (status >= 500) return t('searchError.openrouter.trouble');
  return t('searchError.openrouter.failed');
}

function describeReadStatus(status: number): string {
  if (status === 429) return t('searchError.reader.busy');
  if (status === 451) return t('searchError.reader.forbidden');
  if (status >= 500) return t('searchError.reader.failed');
  return t('searchError.reader.couldNot');
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
        unreachable: t('searchError.unreachable', { service: 'OpenRouter' }),
      }),
      { results: [] },
    );
  }
}

async function fetchPage(args: NormalizedFetchArgs, ctx: SearchContext): Promise<FetchOutcome> {
  const api = await import('@/lib/search/api/jina');
  try {
    const results = await api.runJinaRead(args, { signal: ctx.signal });
    if (!hasReadableContent(results)) return err(t('searchError.reader.couldNot'), { results: [] });
    return ok({ results });
  } catch (error: unknown) {
    return err(
      describeSearchFailure(error, {
        describeStatus: describeReadStatus,
        unreachable: t('searchError.reader.unreachable'),
      }),
      { results: [] },
    );
  }
}

export const openRouterSearchProvider: SearchProvider = {
  id: OPENROUTER_SEARCH_PROVIDER_ID,
  get label() {
    return t('search.openrouter');
  },
  requiresKey: true,
  keyRef: OPENROUTER_KEY_REF,
  usesModelKey: true,
  search,
  fetchPage,
};
