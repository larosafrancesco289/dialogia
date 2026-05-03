import 'server-only';
import { chatCompletion } from '@/lib/openrouter';
import { apiDefaults } from '@/lib/api/config';
import { normalizeUsage, sumUsage, type Usage } from '@/lib/api/normalizers';
import { applyCacheBreakpoints } from '@/lib/agent/cache';
import { getDeepResearchReasoningOnly } from '@/lib/env/server';
import type { ModelMessage } from '@/lib/agent/types';
import type { ProviderSort } from '@/lib/models/providerSort';
import type { DeepResearchEvent } from '@/lib/types/deepResearch';
import { normalizeToolCalls, parseToolArguments } from '@/lib/agent/parsers';
import { buildDeepResearchPrompt } from '@/lib/deep-research/prompt';
import {
  fetchUrl,
  getCurrentTime,
  normalizeFetchUrlArgs,
  runWebSearch,
  type DeepSearchResult,
} from '@/lib/deep-research/server/tools.server';
import { normalizeWebSearchArgs } from '@/lib/search/args';
import { getReasoningSupport } from '@/lib/deep-research/server/reasoningSupport.server';
import type { TransportAuth } from '@/lib/auth/transport';
import { DEEP_RESEARCH_TOOLS } from '@/lib/tools/definitions';

export type DeepResearchParams = {
  auth: TransportAuth; // OPENROUTER_API_KEY (server)
  task: string;
  model: string;
  audience?: string;
  style?: 'concise' | 'detailed' | 'executive';
  cite?: 'inline' | 'footnotes';
  maxIterations?: number;
  providerSort?: ProviderSort;
  zdrOnly?: boolean;
  onProgress?: (event: DeepResearchEvent) => void;
  // Brave options defaults are handled in tool impl
};

export type DeepResearchOutput = {
  answer: string;
  sources: DeepSearchResult[];
  trace?: Array<DeepResearchEvent>;
  usage?: Usage;
  model: string;
};

async function requiresReasoningModel(auth: TransportAuth, modelId: string, origin: string) {
  return getReasoningSupport(auth, modelId, origin);
}

export async function deepResearch(params: DeepResearchParams): Promise<DeepResearchOutput> {
  const {
    auth,
    task,
    model,
    audience,
    style,
    cite,
    maxIterations = 10,
    providerSort,
    zdrOnly,
    onProgress,
  } = params;
  const origin = apiDefaults.resolveOrigin();

  // Enforce reasoning-only usage when configured via env (default true)
  const strict = getDeepResearchReasoningOnly();
  if (strict) {
    const ok = await requiresReasoningModel(auth, model, origin);
    if (!ok) throw new Error('reasoning_model_required');
  }

  const system = buildDeepResearchPrompt({ audience, style, cite });
  const messages: ModelMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: task },
  ];

  const tools = DEEP_RESEARCH_TOOLS;
  const trace: DeepResearchOutput['trace'] = [];
  const collectedSources: DeepSearchResult[] = [];
  const seenUrls = new Set<string>();
  let usage: Usage | undefined;
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
      auth,
      model,
      messages: applyCacheBreakpoints(messages),
      tools: allowTools ? tools : undefined,
      toolChoice: allowTools ? 'auto' : undefined,
      // Encourage sequential tool calls for interleaved reasoning
      parallelToolCalls: allowTools ? false : undefined,
      providerSort,
      zdrOnly,
      origin,
    });
    usage = sumUsage(usage, normalizeUsage(resp?.usage));
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
          const searchArgs = normalizeWebSearchArgs(args);
          const provider = searchArgs.provider || 'brave';
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
        } catch (e: unknown) {
          const err = { error: e instanceof Error ? e.message : 'search_failed' };
          const event: DeepResearchEvent = { type: 'search', input: args, output: err };
          trace?.push(event);
          onProgress?.(event);
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(err) });
        }
        continue;
      }

      if (name === 'fetch_url') {
        const fetchArgs = normalizeFetchUrlArgs(args);
        if (!fetchArgs) {
          const err = { error: 'missing_url' };
          const event: DeepResearchEvent = { type: 'fetch', input: args, output: err };
          trace?.push(event);
          onProgress?.(event);
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(err) });
          continue;
        }
        try {
          const page = await fetchUrl(fetchArgs);
          const event: DeepResearchEvent = { type: 'fetch', input: args, output: page };
          trace?.push(event);
          onProgress?.(event);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name,
            content: JSON.stringify(page),
          });
        } catch (e: unknown) {
          const err = { error: e instanceof Error ? e.message : 'fetch_failed' };
          const event: DeepResearchEvent = { type: 'fetch', input: args, output: err };
          trace?.push(event);
          onProgress?.(event);
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(err) });
        }
        continue;
      }

      if (name === 'get_time') {
        const output = getCurrentTime();
        const event: DeepResearchEvent = { type: 'time', input: args, output };
        trace?.push(event);
        onProgress?.(event);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name,
          content: JSON.stringify(output),
        });
      }
    }
  }

  return {
    answer: '',
    sources: collectedSources,
    trace,
    usage,
    model,
  };
}
