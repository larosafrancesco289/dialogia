// Module: tools/core/searchTools
// Responsibility: The core web_search / web_fetch tools: handlers plus registration.

import { mergeSearchResults, performWebFetchTool, performWebSearchTool } from '@/lib/search';
import { numberResults } from '@/lib/search/tool/results';
import { getSearchProvider } from '@/lib/search/providers';
import { normalizeWebFetchArgs, normalizeWebSearchArgs } from '@/lib/search/args';
import { setSearchUiStatus } from '@/lib/search/ui/state';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';
import { WEB_FETCH_TOOL, WEB_SEARCH_TOOL } from '@/lib/tools/definitions/webSearch';
import { getToolExt, registerTool, type PlanningToolHandler } from '@/lib/tools/registry';
import { t } from '@/lib/i18n';
import { getMessagesForChat } from '@/lib/messages/indexing';

import type { ToolExecutionContext } from '@/lib/tools/execution';

const URL_IN_TEXT = /https?:\/\/[^\s"'<>()\[\]{}]+/gi;

/** An address as compared: no fragment, no trailing slash, no trailing punctuation. */
function comparableUrl(url: string): string {
  return url
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '');
}

/**
 * Whether a page may be read: only at an address that came from search in
 * this chat or from the person, exactly. The model chooses what to fetch,
 * and the reader (Jina, Tavily) fetches it for us: an address it made up can
 * carry the conversation out in its path or query to a host a fetched page
 * named, so it is refused rather than fetched.
 */
export function fetchAllowed(
  url: string,
  aggregatedResults: Array<{ url?: string }>,
  context: Pick<ToolExecutionContext, 'get' | 'chatId' | 'assistantMessage'> & {
    userContent?: unknown;
  },
): boolean {
  const wanted = comparableUrl(url);
  if (!/^https?:\/\//i.test(wanted)) return false;
  const known = new Set<string>();
  const addFrom = (text: string) => {
    for (const match of text.matchAll(URL_IN_TEXT)) known.add(comparableUrl(match[0]));
  };
  for (const result of aggregatedResults) if (result.url) known.add(comparableUrl(result.url));
  if (typeof context.userContent === 'string') addFrom(context.userContent);
  const state = context.get();
  const live = state.messagesById[context.assistantMessage.id];
  for (const message of [...getMessagesForChat(state, context.chatId), ...(live ? [live] : [])]) {
    if (message.role === 'user') addFrom(message.content);
    else addFrom(JSON.stringify([message.annotations ?? [], message.searchSources ?? []]));
  }
  return known.has(wanted);
}

export const CORE_MODULE_ID = 'core';

/** Marker in `ToolMetadata.ext` identifying a tool the scheduler should dedupe and cap. */
const SEARCH_EXT_KEY = 'search';

export function isSearchTool(name: string): boolean {
  return getToolExt(name, SEARCH_EXT_KEY) === true;
}

const executeWebSearchTool: PlanningToolHandler = async ({
  toolCall,
  parsedArgs,
  roundMeta,
  context,
  aggregatedResults,
}) => {
  const { chatId, assistantMessage, userContent, searchProvider, controller, set, get, logger } =
    context;

  const log = logger.start({
    name: 'web_search',
    input: parsedArgs,
    category: 'search',
    metadata: { ...(roundMeta || {}), provider: searchProvider },
  });

  const searchArgs = normalizeWebSearchArgs({
    query: typeof parsedArgs.query === 'string' ? parsedArgs.query : '',
    count: typeof parsedArgs.count === 'number' ? parsedArgs.count : undefined,
    freshness: parsedArgs.freshness,
    country: parsedArgs.country,
    include_domains: parsedArgs.include_domains,
    exclude_domains: parsedArgs.exclude_domains,
    provider: parsedArgs.provider,
  });
  const searchResult = await performWebSearchTool({
    args: searchArgs,
    fallbackQuery: userContent,
    searchProvider,
    controller,
    assistantMessageId: assistantMessage.id,
    chatId,
    set,
    get,
    earlierResults: aggregatedResults,
  });
  const output: Record<string, unknown> = {
    ok: searchResult.ok,
    query: searchResult.query,
  };
  const metadataBase = roundMeta ? { ...roundMeta } : undefined;
  const requestedMeta =
    typeof searchArgs.count === 'number' ? { requested: searchArgs.count } : undefined;

  if (searchResult.ok) {
    const merged = mergeSearchResults([aggregatedResults, searchResult.results]);
    // The sources panel should show everything consulted this turn, not just
    // the latest call; aggregatedResults has exactly that turn-scoped lifetime.
    setSearchUiStatus({ set, get }, assistantMessage.id, {
      query: searchResult.query,
      status: 'done',
      results: merged,
    });
    // The panel above lives only in this tab; the message keeps the list so
    // the reply's [n] citations stay linked after a reload and in other tabs.
    set((state) => {
      const result = updateMessageById(state, chatId, assistantMessage.id, (msg) => ({
        ...msg,
        searchSources: merged.map(({ url, title, description }) => ({ url, title, description })),
      }));
      return result ?? {};
    });
    // Numbered as the reply's sources are, so [n] means the same page to the
    // model, in its system prompt, and under the reply.
    const payload = numberResults(searchResult.results, merged).map((result) => ({
      n: result.n,
      title: result.title,
      url: result.url,
      description: result.description,
    }));
    output.resultsPreview = payload.slice(0, 3);
    log.success(output, {
      ...(metadataBase || {}),
      ...(requestedMeta || {}),
      results: searchResult.results.length,
    });
    return {
      convoMessages: [
        {
          role: 'tool',
          name: 'web_search',
          tool_call_id: toolCall.id,
          content: JSON.stringify(payload),
        },
      ],
      aggregatedResults: merged,
      usedTool: true,
      usedContentTool: false,
    };
  }

  if (searchResult.error === NOTICE_MISSING_SEARCH_KEY) {
    notify(get, NOTICE_MISSING_SEARCH_KEY, 'info');
  }
  const reason = searchResult.error || t('searchError.failed');
  // Unlike an empty result list, a failure tells the model nothing about the web.
  const failure = {
    ...output,
    error: reason,
    hint: 'Tell the person the search failed. Do not say that nothing was found.',
  };
  log.error(
    output,
    reason,
    metadataBase
      ? { ...metadataBase, ...(requestedMeta || {}) }
      : requestedMeta
        ? { ...requestedMeta }
        : undefined,
  );
  return {
    convoMessages: [
      {
        role: 'tool',
        name: 'web_search',
        tool_call_id: toolCall.id,
        content: JSON.stringify(failure),
      },
    ],
    aggregatedResults,
    usedTool: true,
    usedContentTool: false,
  };
};

const executeWebFetchTool: PlanningToolHandler = async ({
  toolCall,
  parsedArgs,
  roundMeta,
  context,
  aggregatedResults,
}) => {
  const { searchProvider, controller, get, logger } = context;

  const fetchArgs = normalizeWebFetchArgs({
    url: typeof parsedArgs.url === 'string' ? parsedArgs.url : '',
    extract_depth: parsedArgs.extract_depth,
    format: parsedArgs.format,
    include_images: parsedArgs.include_images,
    include_favicon: parsedArgs.include_favicon,
    query: parsedArgs.query,
    chunks_per_source: parsedArgs.chunks_per_source,
    provider: parsedArgs.provider,
  });

  const log = logger.start({
    name: 'web_fetch',
    input: fetchArgs,
    category: 'search',
    metadata: { ...(roundMeta || {}), provider: searchProvider },
  });

  if (!fetchAllowed(fetchArgs.url, aggregatedResults, context)) {
    const output = {
      ok: false,
      url: fetchArgs.url,
      error:
        'Pages are read only at an address that came from a search in this chat or from the person.',
      hint: 'Search for the page first and read it from the results, or ask the person for the link. Never build an address yourself.',
    };
    log.error(
      output,
      'web_fetch refused an address from neither search nor the person',
      roundMeta ? { ...roundMeta } : undefined,
    );
    return {
      convoMessages: [
        {
          role: 'tool',
          name: 'web_fetch',
          tool_call_id: toolCall.id,
          content: JSON.stringify(output),
        },
      ],
      aggregatedResults,
      usedTool: true,
      usedContentTool: false,
    };
  }

  const provider = getSearchProvider(searchProvider);
  if (!provider?.fetchPage) {
    const output = { ok: false, url: fetchArgs.url, error: 'unsupported_search_provider' };
    log.error(
      output,
      `${provider?.label ?? 'The active search provider'} cannot fetch a page`,
      roundMeta ? { ...roundMeta } : undefined,
    );
    return {
      convoMessages: [
        {
          role: 'tool',
          name: 'web_fetch',
          tool_call_id: toolCall.id,
          content: JSON.stringify(output),
        },
      ],
      aggregatedResults,
      usedTool: true,
      usedContentTool: false,
    };
  }

  const result = await performWebFetchTool({ args: fetchArgs, searchProvider, controller });

  const metadataBase = roundMeta ? { ...roundMeta } : undefined;
  if (result.ok) {
    const payload = result.results.slice(0, 3).map((entry) => ({
      url: entry.url,
      content: typeof entry.raw_content === 'string' ? entry.raw_content.slice(0, 12000) : '',
      images: entry.images?.slice(0, 8),
      favicon: entry.favicon,
    }));
    log.success(
      { ok: true, url: fetchArgs.url, results: result.results.length },
      { ...(metadataBase || {}), results: result.results.length },
    );
    return {
      convoMessages: [
        {
          role: 'tool',
          name: 'web_fetch',
          tool_call_id: toolCall.id,
          content: JSON.stringify(payload),
        },
      ],
      aggregatedResults,
      usedTool: true,
      usedContentTool: false,
    };
  }

  if (result.error === NOTICE_MISSING_SEARCH_KEY) {
    notify(get, NOTICE_MISSING_SEARCH_KEY, 'info');
  }
  const output = {
    ok: false,
    url: fetchArgs.url,
    error: result.error || t('searchError.reader.couldNot'),
    hint: 'Tell the person this page could not be read. Do not guess what it says; another source may have it.',
  };
  log.error(output, result.error || 'Fetch returned no content', metadataBase);
  return {
    convoMessages: [
      {
        role: 'tool',
        name: 'web_fetch',
        tool_call_id: toolCall.id,
        content: JSON.stringify(output),
      },
    ],
    aggregatedResults,
    usedTool: true,
    usedContentTool: false,
  };
};

export function registerCoreTools(): void {
  registerTool('web_search', {
    definition: WEB_SEARCH_TOOL,
    metadata: {
      module: CORE_MODULE_ID,
      kind: 'action',
      logCategory: 'search',
      ext: { [SEARCH_EXT_KEY]: true },
    },
    handler: executeWebSearchTool,
  });
  registerTool('web_fetch', {
    definition: WEB_FETCH_TOOL,
    metadata: {
      module: CORE_MODULE_ID,
      kind: 'action',
      logCategory: 'search',
      ext: { [SEARCH_EXT_KEY]: true },
    },
    handler: executeWebFetchTool,
  });
}
