import type { ToolDefinition } from '@/lib/transport/contracts';
import { WEB_SEARCH_TOOL } from '@/lib/tools/definitions/webSearch';

export const FETCH_URL_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Fetch a web page and extract main text, title, description, headings, and publication date if present. Use after search to read promising sources.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The absolute URL to fetch.' },
        max_bytes: {
          type: 'integer',
          description: 'Maximum response bytes to read (safety cap).',
          minimum: 1024,
          maximum: 4000000,
          default: 800000,
        },
        timeout_ms: {
          type: 'integer',
          description: 'Per-request timeout in milliseconds.',
          minimum: 2000,
          maximum: 30000,
          default: 15000,
        },
      },
      required: ['url'],
    },
  },
};

export const GET_TIME_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_time',
    description: 'Return the current date/time (ISO) for temporal context and recency checks.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

export const DEEP_RESEARCH_TOOLS: ToolDefinition[] = [
  WEB_SEARCH_TOOL,
  FETCH_URL_TOOL,
  GET_TIME_TOOL,
];

export function getDeepResearchToolDefinitions(): ToolDefinition[] {
  return DEEP_RESEARCH_TOOLS;
}
