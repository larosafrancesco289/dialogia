import type { ToolDefinition } from '@/lib/transport/contracts';

export type WebSearchToolArgs = {
  query: string;
  count?: number;
  freshness?: 'd' | 'w' | 'm' | 'y' | 'all';
  country?: string;
  include_domains?: string[];
  exclude_domains?: string[];
  provider?: 'brave';
};

export const WEB_SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Query the public web via Brave to gather up-to-date, verifiable references with titles, URLs, and summary snippets. Use this when you need fresh facts, statistics, or citations that are not already in context. Craft a precise query and optionally request a small number of results (1-10). You can also apply freshness, country, or domain filters.',
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
          description: 'Recency filter: d (day), w (week), m (month), y (year), all',
          enum: ['d', 'w', 'm', 'y', 'all'],
          default: 'all',
        },
        country: {
          type: 'string',
          description: '2-letter country code (e.g., us, gb, de).',
          default: 'us',
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
          description: 'Search provider to use. Defaults to brave.',
          enum: ['brave'],
          default: 'brave',
        },
      },
      required: ['query'],
    },
  },
};

export function getWebSearchToolDefinition(): ToolDefinition[] {
  return [WEB_SEARCH_TOOL];
}
