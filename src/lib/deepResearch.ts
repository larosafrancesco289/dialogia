import { chatCompletion, fetchModels } from '@/lib/openrouter';
import { getBraveSearchKey, getDeepResearchReasoningOnly } from '@/lib/config';
import { extractMainText } from '@/lib/html';

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
export const DEEP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the public web via Brave for up-to-date results. Use specific queries and small result counts. Avoid redundant calls.',
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

export type DeepSearchResult = {
  title?: string;
  url: string;
  description?: string;
};

export type DeepFetchedPage = {
  url: string;
  title?: string;
  description?: string;
  published?: string;
  headings?: string[];
  text?: string;
  bytes?: number;
};

export type DeepResearchParams = {
  apiKey: string; // OPENROUTER_API_KEY (server)
  task: string;
  model: string;
  audience?: string;
  style?: 'concise' | 'detailed' | 'executive';
  cite?: 'inline' | 'footnotes';
  maxIterations?: number;
  providerSort?: 'price' | 'throughput';
  // Brave options defaults are handled in tool impl
};

export type DeepResearchOutput = {
  answer: string;
  sources: Array<{ title?: string; url: string; description?: string }>;
  trace?: Array<{
    type: 'search' | 'fetch' | 'time' | 'note';
    input?: any;
    output?: any;
  }>;
  usage?: any;
  model: string;
};

async function braveSearch(args: {
  query: string;
  count?: number;
  freshness?: 'd' | 'w' | 'm' | 'y' | 'all';
  country?: string;
  include_domains?: string[];
  exclude_domains?: string[];
}): Promise<DeepSearchResult[]> {
  const apiKey = getBraveSearchKey();
  if (!apiKey) throw new Error('brave_missing_key');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', args.query);
  url.searchParams.set('count', String(Math.min(Math.max(args.count ?? 5, 1), 10)));
  url.searchParams.set('country', (args.country || 'us').toLowerCase());
  url.searchParams.set('safesearch', 'moderate');
  if (args.freshness && args.freshness !== 'all') url.searchParams.set('freshness', args.freshness);
  if (args.include_domains?.length)
    url.searchParams.set('include_domains', args.include_domains.join(','));
  if (args.exclude_domains?.length)
    url.searchParams.set('exclude_domains', args.exclude_domains.join(','));
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`brave_error_${res.status}`);
  const data: any = await res.json();
  const web = data?.web?.results || [];
  return web.slice(0, Math.min(Math.max(args.count ?? 5, 1), 10)).map((r: any) => ({
    title: r?.title,
    url: r?.url,
    description: r?.description,
  }));
}

async function fetchPage(args: {
  url: string;
  max_bytes?: number;
  timeout_ms?: number;
}): Promise<DeepFetchedPage> {
  const maxBytes = Math.min(Math.max(args.max_bytes ?? 800000, 1024), 4_000_000);
  const timeoutMs = Math.min(Math.max(args.timeout_ms ?? 15000, 2000), 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(args.url, {
      headers: {
        'User-Agent': 'Dialogia-DeepResearch/1.0 (+https://github.com/openai/codex-cli)',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`fetch_error_${res.status}`);
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) break;
        html += decoder.decode(value, { stream: true });
      }
    } else {
      html = await res.text();
      if (html.length > maxBytes) html = html.slice(0, maxBytes);
    }
    const { title, description, headings, text } = extractMainText(html);
    // Try to pick a published time from common meta tags
    const published = (() => {
      const m =
        html.match(
          /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        ) ||
        html.match(/<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
        html.match(/<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      return m ? m[1] : undefined;
    })();
    return {
      url: args.url,
      title,
      description,
      headings,
      text,
      published,
      bytes: (text || '').length,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function deepResearch(params: DeepResearchParams): Promise<DeepResearchOutput> {
  const { apiKey, task, model, audience, style, cite, maxIterations = 10, providerSort } = params;

  // Enforce reasoning-only usage when configured via env (default true)
  const strict = getDeepResearchReasoningOnly();
  if (strict) {
    // Verify using OpenRouter metadata instead of name heuristics
    const ok = await (async () => {
      try {
        const models = await fetchModels(apiKey);
        const entry = models.find((m) => m.id.toLowerCase() === model.toLowerCase());
        const supported = Array.isArray((entry?.raw as any)?.supported_parameters)
          ? (entry?.raw as any).supported_parameters.map((p: any) => String(p).toLowerCase())
          : [];
        return supported.includes('reasoning');
      } catch {
        return false;
      }
    })();
    if (!ok) throw new Error('reasoning_model_required');
  }

  const system = buildDeepResearchPrompt({ audience, style, cite });
  const messages: any[] = [
    { role: 'system', content: system },
    { role: 'user', content: task },
  ];

  const tools = DEEP_TOOLS as any[];
  const trace: DeepResearchOutput['trace'] = [];
  const collectedSources: Array<{ title?: string; url: string; description?: string }> = [];
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
    });
    usage = resp?.usage || usage;
    const choice = resp?.choices?.[0];
    const msg = choice?.message || {};
    const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];

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
      const name = tc?.function?.name as string;
      const raw = tc?.function?.arguments || '{}';
      let args: any = {};
      try {
        args = JSON.parse(raw);
      } catch {}

      if (name === 'web_search') {
        try {
          const provider = typeof args?.provider === 'string' ? args.provider : 'brave';
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
          const { provider: _provider, ...searchArgs } = args || {};
          const results = await braveSearch(searchArgs);
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
          const page = await fetchPage(args);
          trace?.push({
            type: 'fetch',
            input: args,
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
        const now = new Date().toISOString();
        trace?.push({ type: 'time', input: {}, output: { now } });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name,
          content: JSON.stringify({ now }),
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
