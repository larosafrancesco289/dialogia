// Module: tools/core/searchTools
// Responsibility: The core web_search / web_fetch tools: handlers plus registration.

import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import { mergeSearchResults, performWebSearchTool, runTavilyFetch } from '@/lib/search';
import { normalizeWebFetchArgs, normalizeWebSearchArgs } from '@/lib/search/args';
import { setSearchUiStatus } from '@/lib/search/ui/state';
import { NOTICE_MISSING_TAVILY_KEY } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';
import { WEB_FETCH_TOOL, WEB_SEARCH_TOOL } from '@/lib/tools/definitions/webSearch';
import { getToolExt, registerTool, type PlanningToolHandler } from '@/lib/tools/registry';
import { withAbort } from '@/lib/utils/abort';

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
    if (searchProvider === 'tavily') {
      // The sources panel should show everything consulted this turn, not just
      // the latest call; aggregatedResults has exactly that turn-scoped lifetime.
      setSearchUiStatus({ set, get }, assistantMessage.id, {
        query: searchResult.query,
        status: 'done',
        results: merged,
      });
    }
    const payload = searchResult.results.slice(0, MAX_FALLBACK_RESULTS).map((result) => ({
      title: result?.title,
      url: result?.url,
      description: result?.description,
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

  if (searchResult.error === NOTICE_MISSING_TAVILY_KEY) {
    notify(get, NOTICE_MISSING_TAVILY_KEY);
  }
  log.error(
    output,
    searchResult.error || 'Search returned no results',
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
        content: 'No results',
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

  if (searchProvider !== 'tavily') {
    const output = { ok: false, url: fetchArgs.url, error: 'unsupported_search_provider' };
    log.error(output, 'web_fetch only supports Tavily', roundMeta ? { ...roundMeta } : undefined);
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

  const result = await withAbort(controller.signal, async (fetchController) => {
    const timeout = setTimeout(() => fetchController.abort(), 30000);
    try {
      return await runTavilyFetch(fetchArgs, { signal: fetchController.signal });
    } finally {
      clearTimeout(timeout);
    }
  });

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

  if (result.error === NOTICE_MISSING_TAVILY_KEY) {
    notify(get, NOTICE_MISSING_TAVILY_KEY);
  }
  const output = { ok: false, url: fetchArgs.url, error: result.error || 'No content' };
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
