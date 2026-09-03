import { withAbort } from '@/lib/utils/abort';
import { buildSearchContext, getSearchProvider } from '@/lib/search/providers';
import type { FetchOutcome, SearchMode } from '@/lib/search/providers/types';
import type { WebFetchArgs } from '@/lib/search/args';
import { err } from '@/lib/utils/result';

export async function performWebFetchTool(opts: {
  args: WebFetchArgs;
  searchProvider: SearchMode;
  controller: AbortController;
}): Promise<FetchOutcome> {
  const provider = getSearchProvider(opts.searchProvider);
  if (!provider?.fetchPage) {
    return err('unsupported_search_provider', { results: [] });
  }
  const fetchPage = provider.fetchPage.bind(provider);

  return withAbort(opts.controller.signal, async (fetchController) => {
    const timeout = setTimeout(() => fetchController.abort(), 30000);
    try {
      return await fetchPage(
        opts.args,
        buildSearchContext(provider, { signal: fetchController.signal }),
      );
    } finally {
      clearTimeout(timeout);
    }
  });
}
