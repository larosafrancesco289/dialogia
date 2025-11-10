import { chatCompletion, fetchModels } from '@/lib/openrouter';
import { apiDefaults } from '@/lib/api/config';
import { getDeepResearchReasoningOnly } from '@/lib/config';
import type { ModelMessage, ToolDefinition } from '@/lib/agent/types';
import type { ProviderSort } from '@/lib/models/providerSort';
import { normalizeToolCalls, parseToolArguments } from '@/lib/agent/parsers';
import {
  runWebSearch,
  fetchUrl,
  getCurrentTime,
  type DeepSearchResult,
  type WebSearchToolArgs,
  type FetchUrlToolArgs,
} from '@/lib/deepResearch/tools';

// System prompt for DeepResearch with interleaved tool reasoning
export function buildDeepResearchPrompt(opts?: {
  audience?: string;
  style?: 'concise' | 'detailed' | 'executive';
  cite?: 'inline' | 'footnotes';
}) {
  const audience = opts?.audience || 'a well-informed general audience';
  const style = opts?.style || 'concise';
  const cite = opts?.cite || 'inline';
  return [
    'You are DeepResearch, a meticulous research agent with access to web search and page fetching tools.',
    '',
    'Goals:',
    '- Plan your research before answering. Formulate 2–4 focused queries.',
    '- Use web_search to gather diverse, recent, high-authority sources.',
    '- Fetch promising URLs with fetch_url to read the primary content and extract quotes.',
    '- Resolve conflicts across sources and double-check claims. Prefer primary and reputable sources.',
    '- Track sources with stable URLs; avoid paywalled/transient spam when possible.',
    '',
    'Operating rules:',
    '- Interleave reasoning between tool calls. After tool results, decide the next best action.',
    '- Call tools with precise arguments; avoid redundant queries and unnecessary calls.',
    '- If a tool fails, adjust queries or pick alternative sources.',
    '- Prefer a small, strong set of sources (3–8) over many weak ones.',
    '- Extract short quotes with context where useful; never fabricate quotes.',
    '- If the answer is uncertain, say so and suggest how to verify.',
    '',
    `Audience: ${audience}. Style: ${style}. Citations: ${cite === 'inline' ? 'cite inline as [n]' : 'append footnotes'}.`,
    '',
    'Output format:',
    '- Start with a crisp executive summary (3–6 bullets).',
    '- Follow with a balanced analysis that distinguishes facts from interpretation.',
    '- Include a brief timeline or key numbers section when relevant.',
    `- ${cite === 'inline' ? 'Cite sources inline as [n]' : 'Add footnotes [n] at the end'} with stable URLs.`,
  ].join('\n');
}

// Tool definitions following OpenRouter tool-calling spec
export const DEEP_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Run a Brave web search to pull current public information complete with URLs and snippets for sourcing. Use this when you need fresh facts or citations that are not already in context, and skip it for background knowledge you can reason through without external evidence. Supply focused queries, request only the number of results you plan to read (1-10), and avoid redundant calls so subsequent fetches stay efficient.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (keep focused and specific).' },
          count: {
            type: 'integer',
            description: 'Number of results (1-10). Use 3–6 typically.',
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
  },
  {
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
  },
  {
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
  },
];

export type DeepResearchParams = {
  apiKey: string; // OPENROUTER_API_KEY (server)
  task: string;
  model: string;
  audience?: string;
  style?: 'concise' | 'detailed' | 'executive';
  cite?: 'inline' | 'footnotes';
  maxIterations?: number;
  providerSort?: ProviderSort;
  // Brave options defaults are handled in tool impl
};

export type DeepResearchOutput = {
  answer: string;
  sources: DeepSearchResult[];
  trace?: Array<{
    type: 'search' | 'fetch' | 'time' | 'note';
    input?: any;
    output?: any;
  }>;
  usage?: any;
  model: string;
};

async function requiresReasoningModel(apiKey: string, modelId: string, origin: string) {
  try {
    const models = await fetchModels(apiKey, { origin });
    const entry = models.find((m) => m.id.toLowerCase() === modelId.toLowerCase());
    const supported = Array.isArray((entry?.raw as any)?.supported_parameters)
      ? (entry?.raw as any).supported_parameters.map((p: any) => String(p).toLowerCase())
      : [];
    return supported.includes('reasoning');
  } catch {
    return false;
  }
}

export async function deepResearch(params: DeepResearchParams): Promise<DeepResearchOutput> {
  const { apiKey, task, model, audience, style, cite, maxIterations = 10, providerSort } = params;
  const origin = apiDefaults.resolveOrigin();

  // Enforce reasoning-only usage when configured via env (default true)
  const strict = getDeepResearchReasoningOnly();
  if (strict) {
    const ok = await requiresReasoningModel(apiKey, model, origin);
    if (!ok) throw new Error('reasoning_model_required');
  }

  const system = buildDeepResearchPrompt({ audience, style, cite });
  const messages: ModelMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: task },
  ];

  const tools = DEEP_TOOLS;
  const trace: DeepResearchOutput['trace'] = [];
  const collectedSources: DeepSearchResult[] = [];
  const seenUrls = new Set<string>();
  let usage: any | undefined;
  let lastSourceCount = 0;

  const budget = Math.max(1, Math.min(maxIterations, 20));
  for (let i = 0; i < budget; i++) {
    const allowTools = i < budget - 1; // On final iteration, force synthesis
    // Encourage synthesis once progress stalls or we have enough sources
    if (i >= 2) {
      const noNew = collectedSources.length === lastSourceCount;
      if (noNew || collectedSources.length >= 6) {
        messages.push({
          role: 'user',
          content:
            'Stop researching and write the final answer now. Synthesize the findings concisely and cite sources inline as [n].',
        });
      }
    }
    lastSourceCount = collectedSources.length;

    const resp = await chatCompletion({
      apiKey,
      model,
      messages,
      tools: allowTools ? tools : undefined,
      tool_choice: allowTools ? 'auto' : undefined,
      // Encourage sequential tool calls for interleaved reasoning
      parallel_tool_calls: allowTools ? false : undefined,
      providerSort,
      origin,
    });
    usage = resp?.usage || usage;
    const choice = resp?.choices?.[0];
    const msg = choice?.message || {};
    const toolCalls = normalizeToolCalls(msg);

    if (!allowTools || toolCalls.length === 0) {
      const final = typeof msg?.content === 'string' ? msg.content : '';
      return {
        answer: final,
        sources: collectedSources,
        trace,
        usage,
        model,
      };
    }

    // Append assistant tool_calls to maintain full context
    messages.push({ role: 'assistant', content: null, tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = parseToolArguments(tc);

      if (name === 'web_search') {
        try {
          const provider = typeof (args as { provider?: unknown }).provider === 'string'
            ? ((args as { provider?: string }).provider as string)
            : 'brave';
          if (provider !== 'brave') {
            const unsupported = { error: `unsupported_provider_${provider}` };
            trace?.push({ type: 'search', input: args, output: unsupported });
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name,
              content: JSON.stringify(unsupported),
            });
            continue;
          }
          const includeDomains = Array.isArray((args as any).include_domains)
            ? (args as any).include_domains.filter((entry: unknown): entry is string =>
                typeof entry === 'string',
              )
            : undefined;
          const excludeDomains = Array.isArray((args as any).exclude_domains)
            ? (args as any).exclude_domains.filter((entry: unknown): entry is string =>
                typeof entry === 'string',
              )
            : undefined;
          const searchArgs: WebSearchToolArgs = {
            query: typeof (args as any).query === 'string' ? (args as any).query : '',
            count: typeof (args as any).count === 'number' ? (args as any).count : undefined,
            freshness:
              (args as any).freshness === 'd' ||
              (args as any).freshness === 'w' ||
              (args as any).freshness === 'm' ||
              (args as any).freshness === 'y' ||
              (args as any).freshness === 'all'
                ? ((args as any).freshness as 'd' | 'w' | 'm' | 'y' | 'all')
                : undefined,
            country:
              typeof (args as any).country === 'string' ? (args as any).country : undefined,
            include_domains: includeDomains,
            exclude_domains: excludeDomains,
          };
          const results = await runWebSearch(searchArgs);
          trace?.push({ type: 'search', input: args, output: results });
          for (const r of results) {
            if (!r?.url) continue;
            if (!seenUrls.has(r.url)) {
              seenUrls.add(r.url);
              collectedSources.push({ title: r.title, url: r.url, description: r.description });
            }
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name,
            content: JSON.stringify(results),
          });
        } catch (e: any) {
          const err = { error: String(e?.message || 'search_failed') };
          trace?.push({ type: 'search', input: args, output: err });
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(err) });
        }
        continue;
      }

      if (name === 'fetch_url') {
        try {
          const fetchArgs: FetchUrlToolArgs = {
            url: typeof (args as any).url === 'string' ? (args as any).url : '',
            max_bytes: typeof (args as any).max_bytes === 'number' ? (args as any).max_bytes : undefined,
            timeout_ms:
              typeof (args as any).timeout_ms === 'number' ? (args as any).timeout_ms : undefined,
          };
          if (!fetchArgs.url) throw new Error('fetch_missing_url');
          const page = await fetchUrl(fetchArgs);
          trace?.push({
            type: 'fetch',
            input: fetchArgs,
            output: { ...page, text: page.text?.slice(0, 4000) },
          });
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(page) });
        } catch (e: any) {
          const err = { error: String(e?.message || 'fetch_failed') };
          trace?.push({ type: 'fetch', input: args, output: err });
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(err) });
        }
        continue;
      }

      if (name === 'get_time') {
        const timePayload = getCurrentTime();
        trace?.push({ type: 'time', input: {}, output: timePayload });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name,
          content: JSON.stringify(timePayload),
        });
        continue;
      }

      // Unknown tool: return a sentinel error so the model can adjust
      const unknown = { error: 'unknown_tool' };
      messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(unknown) });
    }
    // Encourage the model to synthesize or continue searching as needed
    messages.push({
      role: 'user',
      content: 'Synthesize findings so far or continue targeted research as needed.',
    });
  }

  // Fallback when iterations exhausted: force a final synthesis without tools
  try {
    messages.push({
      role: 'user',
      content:
        'You have reached the research iteration limit. Write the final answer now using the gathered sources below. Cite inline as [n].\n\nSources:\n' +
        collectedSources.map((s, i) => `[${i + 1}] ${s.title || s.url} — ${s.url}`).join('\n'),
    });
    const resp = await chatCompletion({ apiKey, model, messages, providerSort });
    const choice = resp?.choices?.[0];
    const msg = choice?.message || {};
    const final = typeof msg?.content === 'string' ? msg.content : '';
    return { answer: final, sources: collectedSources, trace, usage: resp?.usage || usage, model };
  } catch {
    return {
      answer: 'Here is a synthesis based on gathered sources.',
      sources: collectedSources,
      trace,
      usage,
      model,
    };
  }
}
