import type { ToolDefinition } from '@/lib/transport/contracts';
import type { WebFetchArgs, WebSearchArgs } from '@/lib/search/args';

export type WebSearchToolArgs = WebSearchArgs;
export type WebFetchToolArgs = WebFetchArgs;

export const WEB_SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Query the public web to gather up-to-date, verifiable references with titles, URLs, and summary snippets. Use this when you need fresh facts, statistics, or citations that are not already in context. Craft a short, focused query (not the full user message); for multi-part questions, issue several parallel calls with one sub-question each (up to 3). Snippets are for discovery; to read a promising result in depth before citing it, follow up with web_fetch on its URL.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to run.' },
        count: {
          type: 'integer',
          description: 'How many results to retrieve (1-10).',
          minimum: 1,
          maximum: 10,
          default: 5,
        },
        freshness: {
          type: 'string',
          description:
            'Recency filter: d (day), w (week), m (month), y (year), all. Omit by default and put the timeframe in the query text instead — narrow windows restrict to recently indexed pages and often return zero results. Reserve d/w for breaking news.',
          enum: ['d', 'w', 'm', 'y', 'all'],
          default: 'all',
        },
        country: {
          type: 'string',
          description: 'Country name or common 2-letter country code (e.g., united states, us).',
        },
        include_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Restrict results to these domains (optional).',
        },
        exclude_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exclude results from these domains (optional).',
        },
        provider: {
          type: 'string',
          description: 'Search provider to use. Defaults to tavily.',
          enum: ['tavily'],
          default: 'tavily',
        },
      },
      required: ['query'],
    },
  },
};

export const WEB_FETCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_fetch',
    description:
      'Fetch and extract clean content from a specific public URL. Use this when the user provides a URL, when search results need source inspection, or when you need page text for accurate citation. Prefer markdown unless plain text is specifically useful.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The public URL to fetch and extract.' },
        extract_depth: {
          type: 'string',
          description:
            'Extraction depth. Use basic by default; advanced can retrieve more tables and embedded content but may be slower.',
          enum: ['basic', 'advanced'],
          default: 'basic',
        },
        format: {
          type: 'string',
          description: 'Output format for extracted page content.',
          enum: ['markdown', 'text'],
          default: 'markdown',
        },
        include_images: {
          type: 'boolean',
          description: 'Whether to include extracted image URLs.',
          default: false,
        },
        include_favicon: {
          type: 'boolean',
          description: 'Whether to include the page favicon URL.',
          default: false,
        },
        query: {
          type: 'string',
          description:
            'Optional focused query. When provided, Tavily can return the most relevant chunks from the source.',
        },
        chunks_per_source: {
          type: 'integer',
          description: 'Relevant chunks to return when query is provided (1-5).',
          minimum: 1,
          maximum: 5,
          default: 3,
        },
        provider: {
          type: 'string',
          description: 'Fetch provider to use. Defaults to tavily.',
          enum: ['tavily'],
          default: 'tavily',
        },
      },
      required: ['url'],
    },
  },
};

/** `web_fetch` is offered only when the active provider can read a single page. */
export function getWebSearchToolDefinition(
  opts: { canFetchPage?: boolean } = {},
): ToolDefinition[] {
  return opts.canFetchPage === false ? [WEB_SEARCH_TOOL] : [WEB_SEARCH_TOOL, WEB_FETCH_TOOL];
}
