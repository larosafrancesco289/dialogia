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
import { WEB_SEARCH_TOOL } from '@/lib/tools/webSearch';

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
    'Core Objective:',
    "Answer the user's request by gathering verifiable facts from high-quality online sources. You must reason step-by-step, explaining your research plan and every action you take.",
    '',
    'Research Loop:',
    '1. **Analyze**: specificy what information is needed to answer the request.',
    '2. **Search**: Use `web_search` to find relevant pages. Use focused, diverse queries. If a search yields poor results, refine the query and try again.',
    '3. **Read**: Use `fetch_url` to read the full content of promising search results to extract specific details, quotes, and data.',
    '4. **Synthesize**: Compare information from multiple sources to ensure accuracy. Resolve conflicts.',
    '5. **Repeat**: Continue this loop until you have sufficient information to provide a comprehensive answer.',
    '',
    'Operating Rules:',
    '- **Always reason before acting**: Explicitly state what you are looking for and why before calling a tool.',
    "- **Verify, don't guess**: If you are unsure, search again. Do not halluncinate information.",
    '- **Cite sources**: Keep track of URLs. In your final answer, cite every claim.',
    '- **Be efficient**: Call tools with precise arguments. Avoid redundant queries.',
    '',
    `Target Audience: ${audience}.`,
    `Tone & Style: ${style}.`,
    `Citations: ${cite === 'inline' ? 'cite inline as [n]' : 'append footnotes'}.`,
    '',
    'Output Format:',
    '- Start with a clear "Thinking:" block (implicit in your reasoning) explaining your plan.',
    '- Execute tool calls as needed.',
    '- When finished, provide the **Final Answer** starting with a crisp summary, followed by detailed analysis and citations.',
  ].join('\n');
}

// Tool definitions following OpenRouter tool-calling spec
export const DEEP_TOOLS: ToolDefinition[] = [
  WEB_SEARCH_TOOL,
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

export type DeepResearchEvent = {
  type: 'search' | 'fetch' | 'time' | 'note' | 'thought';
  input?: any;
  output?: any;
};

export type DeepResearchParams = {
  apiKey: string; // OPENROUTER_API_KEY (server)
  task: string;
  model: string;
  audience?: string;
  style?: 'concise' | 'detailed' | 'executive';
  cite?: 'inline' | 'footnotes';
  maxIterations?: number;
  providerSort?: ProviderSort;
  onProgress?: (event: DeepResearchEvent) => void;
  // Brave options defaults are handled in tool impl
};

export type DeepResearchOutput = {
  answer: string;
  sources: DeepSearchResult[];
  trace?: Array<DeepResearchEvent>;
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
  const {
    apiKey,
    task,
    model,
    audience,
    style,
    cite,
    maxIterations = 10,
    providerSort,
    onProgress,
  } = params;
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

    // Capture interleaved thought if present
    const thought = typeof msg?.content === 'string' ? msg.content : '';
    if (thought) {
      const event: DeepResearchEvent = { type: 'thought', input: {}, output: thought };
      trace?.push(event);
      onProgress?.(event);
    }

    if (!allowTools || toolCalls.length === 0) {
      const final = thought;
      return {
        answer: final,
        sources: collectedSources,
        trace,
        usage,
        model,
      };
    }

    // Append assistant tool_calls to maintain full context, including the thought
    messages.push({ role: 'assistant', content: thought || null, tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = parseToolArguments(tc);

      if (name === 'web_search') {
        try {
          const provider =
            typeof (args as { provider?: unknown }).provider === 'string'
              ? ((args as { provider?: string }).provider as string)
              : 'brave';
          if (provider !== 'brave') {
            const unsupported = { error: `unsupported_provider_${provider}` };
            const event: DeepResearchEvent = { type: 'search', input: args, output: unsupported };
            trace?.push(event);
            onProgress?.(event);
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name,
              content: JSON.stringify(unsupported),
            });
            continue;
          }
          const includeDomains = Array.isArray((args as any).include_domains)
            ? (args as any).include_domains.filter(
                (entry: unknown): entry is string => typeof entry === 'string',
              )
            : undefined;
          const excludeDomains = Array.isArray((args as any).exclude_domains)
            ? (args as any).exclude_domains.filter(
                (entry: unknown): entry is string => typeof entry === 'string',
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
            country: typeof (args as any).country === 'string' ? (args as any).country : undefined,
            include_domains: includeDomains,
            exclude_domains: excludeDomains,
          };
          const results = await runWebSearch(searchArgs);
          const event: DeepResearchEvent = { type: 'search', input: args, output: results };
          trace?.push(event);
          onProgress?.(event);
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
          const event: DeepResearchEvent = { type: 'search', input: args, output: err };
          trace?.push(event);
          onProgress?.(event);
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(err) });
        }
        continue;
      }

      if (name === 'fetch_url') {
        try {
          const fetchArgs: FetchUrlToolArgs = {
            url: typeof (args as any).url === 'string' ? (args as any).url : '',
            max_bytes:
              typeof (args as any).max_bytes === 'number' ? (args as any).max_bytes : undefined,
            timeout_ms:
              typeof (args as any).timeout_ms === 'number' ? (args as any).timeout_ms : undefined,
          };
          if (!fetchArgs.url) throw new Error('fetch_missing_url');
          const page = await fetchUrl(fetchArgs);
          const event: DeepResearchEvent = {
            type: 'fetch',
            input: fetchArgs,
            output: { ...page, text: page.text?.slice(0, 4000) },
          };
          trace?.push(event);
          onProgress?.(event);
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(page) });
        } catch (e: any) {
          const err = { error: String(e?.message || 'fetch_failed') };
          const event: DeepResearchEvent = { type: 'fetch', input: args, output: err };
          trace?.push(event);
          onProgress?.(event);
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(err) });
        }
        continue;
      }

      if (name === 'get_time') {
        const timePayload = getCurrentTime();
        const event: DeepResearchEvent = { type: 'time', input: {}, output: timePayload };
        trace?.push(event);
        onProgress?.(event);
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
