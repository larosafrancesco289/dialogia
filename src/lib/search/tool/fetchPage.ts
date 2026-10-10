import { withAbort } from '@/lib/utils/abort';
import { buildSearchContext, getSearchProvider } from '@/lib/search/providers';
import {
  hasReadableContent,
  type FetchOutcome,
  type SearchMode,
} from '@/lib/search/providers/types';
import type { WebFetchArgs } from '@/lib/search/args';
import { err } from '@/lib/utils/result';
import { TOOL_CALL_STOPPED } from '@/lib/constants';
import { t } from '@/lib/i18n';

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
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      fetchController.abort();
    }, 30000);
    try {
      const outcome = await fetchPage(
        opts.args,
        buildSearchContext(provider, { signal: fetchController.signal }),
      );
      // Success with nothing to read is a page that did not load, whatever the provider says.
      if (outcome.ok) {
        return hasReadableContent(outcome.results)
          ? outcome
          : err(t('searchError.reader.couldNot'), { results: [] });
      }
      // An abort says why it ended, not the browser's "signal is aborted".
      if (opts.controller.signal.aborted) return err(TOOL_CALL_STOPPED, { results: [] });
      if (timedOut) return err(t('searchError.pageTooLong'), { results: [] });
      return outcome;
    } finally {
      clearTimeout(timeout);
    }
  });
}
