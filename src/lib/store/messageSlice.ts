import { v4 as uuidv4 } from 'uuid';
import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { saveMessage } from '@/lib/db';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { stripLeadingToolJson } from '@/lib/agent/streaming';
import { streamChatCompletion, chatCompletion } from '@/lib/openrouter';
import { MAX_FALLBACK_RESULTS } from '@/lib/constants';

export function createMessageSlice(
  set: (updater: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  return {
    async sendUserMessage(content: string) {
      const useProxy = process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
      const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
      if (!key && !useProxy)
        return set((s) => ({ ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' } }));
      const chatId = get().selectedChatId!;
      const chat = get().chats.find((c) => c.id === chatId)!;
      const now = Date.now();
      const userMsg: Message = { id: uuidv4(), chatId, role: 'user', content, createdAt: now };
      const assistantMsg: Message = {
        id: uuidv4(),
        chatId,
        role: 'assistant',
        content: '',
        createdAt: now + 1,
        model: chat.settings.model,
        reasoning: '',
      };
      const priorList = get().messages[chatId] ?? [];
      set((s) => ({ messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), userMsg, assistantMsg] }, ui: { ...s.ui, isStreaming: true } }));
      await saveMessage(userMsg);
      await saveMessage(assistantMsg);

      const msgs = buildChatCompletionMessages({ chat, priorMessages: priorList, models: get().models, newUserContent: content });
      if (chat.title === 'New Chat') {
        const draft = content.trim().slice(0, 40);
        await get().renameChat(chat.id, draft || 'New Chat');
      }

      const attemptToolUse = !!chat.settings.search_with_brave;
      const toolPreambleText =
        'You have access to a function tool named "web_search" that retrieves up-to-date web results.\n\nWhen you need current, factual, or source-backed information, call the tool first. If you call a tool, respond with ONLY tool_calls (no user-facing text). After the tool returns, write the final answer that cites sources inline as [n] using the numbering provided.\n\nweb_search(args): { query: string, count?: integer 1-10 }. Choose a focused query and a small count, and avoid unnecessary calls.';
      const combinedSystemForThisTurn = attemptToolUse
        ? chat.settings.system && chat.settings.system.trim()
          ? `${toolPreambleText}\n\n${chat.settings.system}`
          : toolPreambleText
        : undefined;
      if (attemptToolUse) {
        try {
          const controller = new AbortController();
          set((s) => ({ ...s, _controller: controller as any }) as any);
          const toolDefinition = [
            {
              type: 'function',
              function: {
                name: 'web_search',
                description:
                  'Search the public web for up-to-date information. Use only when necessary. Return results to ground your answer and cite sources as [n].',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'The search query to run.' },
                    count: {
                      type: 'integer',
                      description: 'How many results to retrieve (1-10).',
                      minimum: 1,
                      maximum: 10,
                    },
                  },
                  required: ['query'],
                },
              },
            },
          ];
          const planningSystem = { role: 'system', content: combinedSystemForThisTurn! } as const;
          const planningMessages: any[] = [planningSystem, ...msgs.filter((m) => m.role !== 'system')];
          let convo = planningMessages.slice();
          let rounds = 0;
          let firstTurn = true;
          let finalContent: string | null = null;
          let finalUsage: any | undefined = undefined;
          const extractInlineWebSearchArgs = (text: string): { query: string; count?: number } | null => {
            try {
              const candidates: Array<Record<string, any>> = [];
              const jsonMatches = text.match(/\{[\s\S]*?\}/g) || [];
              for (const m of jsonMatches) {
                try { candidates.push(JSON.parse(m)); } catch {}
              }
              for (const c of candidates) {
                if (typeof c.query === 'string') {
                  const q = String(c.query).trim();
                  if (q) {
                    const cnt = Number.isFinite(c.count) ? Math.max(1, Math.min(10, Math.floor(c.count))) : undefined;
                    return { query: q, count: cnt };
                  }
                }
                if (typeof c.name === 'string' && c.name === 'web_search') {
                  const arg = c.arguments;
                  if (typeof arg === 'string') {
                    try {
                      const inner = JSON.parse(arg);
                      if (inner && typeof inner.query === 'string' && inner.query.trim()) {
                        const cnt = Number.isFinite(inner.count) ? Math.max(1, Math.min(10, Math.floor(inner.count))) : undefined;
                        return { query: inner.query.trim(), count: cnt };
                      }
                    } catch {}
                  } else if (arg && typeof arg === 'object' && typeof arg.query === 'string') {
                    const q = String(arg.query).trim();
                    if (q) {
                      const cnt = Number.isFinite(arg.count) ? Math.max(1, Math.min(10, Math.floor(arg.count))) : undefined;
                      return { query: q, count: cnt };
                    }
                  }
                }
              }
            } catch {}
            return null;
          };
          while (rounds < 3) {
            const resp = await chatCompletion({
              apiKey: key || '',
              model: chat.settings.model,
              messages: convo as any,
              temperature: chat.settings.temperature,
              top_p: chat.settings.top_p,
              max_tokens: chat.settings.max_tokens,
              reasoning_effort: chat.settings.reasoning_effort,
              reasoning_tokens: chat.settings.reasoning_tokens,
              tools: toolDefinition as any,
              tool_choice: firstTurn ? ({ type: 'function', function: { name: 'web_search' } } as any) : 'auto',
              signal: controller.signal,
            });
            finalUsage = resp?.usage;
            const choice = resp?.choices?.[0];
            const message = choice?.message || {};
            let toolCalls =
              Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
                ? message.tool_calls
                : message?.function_call
                  ? [ { id: 'call_0', type: 'function', function: { name: message.function_call.name, arguments: message.function_call.arguments } } ]
                  : [];
            if ((!toolCalls || toolCalls.length === 0) && typeof message?.content === 'string') {
              const inline = extractInlineWebSearchArgs(message.content);
              if (inline) toolCalls = [ { id: 'call_0', type: 'function', function: { name: 'web_search', arguments: JSON.stringify(inline) } } ];
            }
            if (toolCalls && toolCalls.length > 0) {
              convo.push({ role: 'assistant', content: null, tool_calls: toolCalls } as any);
            }
            if (firstTurn && (!toolCalls || toolCalls.length === 0)) {
              toolCalls = [ { id: 'call_0', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query: content, count: 5 }) } } ];
              convo.push({ role: 'assistant', content: null, tool_calls: toolCalls } as any);
            }
            firstTurn = false;
            if (!toolCalls || toolCalls.length === 0) {
              const text = typeof message?.content === 'string' ? message.content : '';
              finalContent = stripLeadingToolJson(text);
              break;
            }
            for (const tc of toolCalls) {
              const name = tc?.function?.name as string;
              let args: any = {};
              try {
                const rawArgs = (tc?.function as any)?.arguments;
                if (typeof rawArgs === 'string') args = JSON.parse(rawArgs || '{}');
                else if (rawArgs && typeof rawArgs === 'object') args = rawArgs;
              } catch {}
              if (name !== 'web_search') continue;
              let rawQuery = String(args?.query || '').trim();
              const count = Math.min(Math.max(parseInt(String(args?.count || '5'), 10) || 5, 1), 10);
              if (!rawQuery) rawQuery = content.trim().slice(0, 256);
              set((s) => ({ ui: { ...s.ui, braveByMessageId: { ...(s.ui.braveByMessageId || {}), [assistantMsg.id]: { query: rawQuery, status: 'loading' } } } }));
              try {
                const res = await fetch(`/api/brave?q=${encodeURIComponent(rawQuery)}&count=${count}`, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal } as any);
                if (res.ok) {
                  const data: any = await res.json();
                  const results = (data?.results || []) as any[];
                  set((s) => ({ ui: { ...s.ui, braveByMessageId: { ...(s.ui.braveByMessageId || {}), [assistantMsg.id]: { query: rawQuery, status: 'done', results } } } }));
                  const lines = results
                    .slice(0, MAX_FALLBACK_RESULTS)
                    .map((r, i) => `${i + 1}. ${(r.title || r.url || 'Result').toString()} — ${r.url || ''}${r.description ? ` — ${r.description}` : ''}`)
                    .join('\n');
                  convo.push({ role: 'tool', name: 'web_search', tool_call_id: tc.id, content: `Web search results for: ${rawQuery}\n\n${lines}` } as any);
                } else {
                  if (res.status === 400) set((s) => ({ ui: { ...s.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
                  convo.push({ role: 'tool', name: 'web_search', tool_call_id: tc.id, content: 'No results' } as any);
                }
              } catch {
                set((s) => ({ ui: { ...s.ui, braveByMessageId: { ...(s.ui.braveByMessageId || {}), [assistantMsg.id]: { query: rawQuery, status: 'error', results: [], error: 'Network error' } } } }));
                convo.push({ role: 'tool', name: 'web_search', tool_call_id: tc.id, content: 'No results' } as any);
              }
            }
            convo.push({ role: 'user', content: 'Write the final answer. Cite sources inline as [n].' } as any);
            rounds++;
          }
          if (finalContent != null) {
            set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
            const tokensIn = finalUsage?.prompt_tokens ?? finalUsage?.input_tokens;
            const tokensOut = finalUsage?.completion_tokens ?? finalUsage?.output_tokens;
            const final = { ...assistantMsg, content: finalContent, reasoning: undefined, metrics: { ttftMs: undefined, completionMs: undefined, promptTokens: tokensIn, completionTokens: tokensOut, tokensPerSec: undefined }, tokensIn, tokensOut } as any;
            set((s) => {
              const list = s.messages[chatId] ?? [];
              const updated = list.map((m) => (m.id === assistantMsg.id ? final : m));
              return { messages: { ...s.messages, [chatId]: updated } } as any;
            });
            await saveMessage(final);
            set((s) => ({ ...s, _controller: undefined }) as any);
            return;
          }
          set((s) => ({ ...s, _controller: undefined }) as any);
        } catch (e: any) {
          if (e?.message === 'unauthorized') set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
          if (e?.message === 'rate_limited') set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' } }));
          set((s) => ({ ...s, _controller: undefined }) as any);
        }
      }

      try {
        const controller = new AbortController();
        set((s) => ({ ...s, _controller: controller as any }) as any);
        const tStart = performance.now();
        let tFirst: number | undefined;
        const streamingMessages = await (async () => {
          if (combinedSystemForThisTurn) {
            const rest = msgs.filter((m) => m.role !== 'system');
            let augmented = combinedSystemForThisTurn;
            let fbResults: { title?: string; url?: string; description?: string }[] | undefined;
            const pre = get().ui.braveByMessageId?.[assistantMsg.id];
            if (pre && pre.status === 'done' && pre.query === content) fbResults = pre.results || [];
            if (!fbResults || fbResults.length === 0) {
              set((s) => ({ ui: { ...s.ui, braveByMessageId: { ...(s.ui.braveByMessageId || {}), [assistantMsg.id]: { query: content, status: 'loading' } } } }));
              try {
                const res = await fetch(`/api/brave?q=${encodeURIComponent(content)}&count=5`, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal } as any);
                if (res.ok) {
                  const data: any = await res.json();
                  fbResults = (data?.results || []) as any[];
                  set((s) => ({ ui: { ...s.ui, braveByMessageId: { ...(s.ui.braveByMessageId || {}), [assistantMsg.id]: { query: content, status: 'done', results: fbResults } } } }));
                } else {
                  if (res.status === 400) set((s) => ({ ui: { ...s.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
                  fbResults = [];
                  set((s) => ({ ui: { ...s.ui, braveByMessageId: { ...(s.ui.braveByMessageId || {}), [assistantMsg.id]: { query: content, status: 'error', results: [], error: res.status === 400 ? 'Missing BRAVE_SEARCH_API_KEY' : 'Search failed' } } } }));
                }
              } catch {
                fbResults = [];
                set((s) => ({ ui: { ...s.ui, braveByMessageId: { ...(s.ui.braveByMessageId || {}), [assistantMsg.id]: { query: content, status: 'error', results: [], error: 'Network error' } } } }));
              }
            }
            if (fbResults && fbResults.length > 0) {
              const lines = fbResults.slice(0, MAX_FALLBACK_RESULTS).map((r, i) => `${i + 1}. ${(r.title || r.url || 'Result').toString()} — ${r.url || ''}${r.description ? ` — ${r.description}` : ''}`).join('\n');
              const fallbackBlock = `\n\nWeb search results (fallback):\n${lines}\n\nInstructions: Use these results to answer the user. Cite sources inline as [n].`;
              augmented = augmented + fallbackBlock;
            }
            return [{ role: 'system', content: augmented } as const, ...rest];
          }
          return msgs;
        })();
        let startedStreamingContent = attemptToolUse ? false : true;
        let leadingBuffer = '';
        await streamChatCompletion({
          apiKey: key || '',
          model: chat.settings.model,
          messages: streamingMessages,
          temperature: chat.settings.temperature,
          top_p: chat.settings.top_p,
          max_tokens: chat.settings.max_tokens,
          reasoning_effort: chat.settings.reasoning_effort,
          reasoning_tokens: chat.settings.reasoning_tokens,
          signal: controller.signal,
          callbacks: {
            onToken: (delta) => {
              if (tFirst == null) tFirst = performance.now();
              if (!startedStreamingContent) {
                leadingBuffer += delta;
                const hasStructure = leadingBuffer.trimStart().startsWith('{') || leadingBuffer.trimStart().startsWith('```');
                if (hasStructure) {
                  const stripped = stripLeadingToolJson(leadingBuffer);
                  const rest = stripped.trimStart();
                  if (rest && !(rest.startsWith('{') || rest.startsWith('```'))) {
                    startedStreamingContent = true;
                    const toEmit = stripped;
                    leadingBuffer = '';
                    set((s) => {
                      const list = s.messages[chatId] ?? [];
                      const updated = list.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m));
                      return { messages: { ...s.messages, [chatId]: updated } } as any;
                    });
                  }
                } else if (leadingBuffer.length > 512) {
                  startedStreamingContent = true;
                  const toEmit = leadingBuffer;
                  leadingBuffer = '';
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m));
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                }
              } else {
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m));
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              }
            },
            onReasoningToken: (delta) => {
              if (tFirst == null) tFirst = performance.now();
              set((s) => {
                const list = s.messages[chatId] ?? [];
                const updated = list.map((m) => (m.id === assistantMsg.id ? { ...m, reasoning: (m.reasoning || '') + delta } : m));
                return { messages: { ...s.messages, [chatId]: updated } } as any;
              });
            },
            onDone: async (full, extras) => {
              set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
              const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
              const tEnd = performance.now();
              const ttftMs = tFirst ? Math.max(0, Math.round(tFirst - tStart)) : undefined;
              const completionMs = Math.max(0, Math.round(tEnd - tStart));
              const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
              const completionTokens = extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
              const tokensPerSec = completionTokens && completionMs ? +(completionTokens / (completionMs / 1000)).toFixed(2) : undefined;
              const final = { ...assistantMsg, content: stripLeadingToolJson(full || ''), reasoning: current?.reasoning, metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec }, tokensIn: promptTokens, tokensOut: completionTokens } as any;
              set((s) => {
                const list = s.messages[chatId] ?? [];
                const updated = list.map((m) => (m.id === assistantMsg.id ? final : m));
                return { messages: { ...s.messages, [chatId]: updated } } as any;
              });
              await saveMessage(final);
              set((s) => ({ ...s, _controller: undefined }) as any);
            },
            onError: (err) => {
              set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
              set((s) => ({ ...s, _controller: undefined }) as any);
            },
          },
        });
      } catch (e: any) {
        if (e?.message === 'unauthorized') set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
        if (e?.message === 'rate_limited') set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' } }));
        set((s) => ({ ...s, _controller: undefined }) as any);
      }
    },

    stopStreaming() {
      const controller = (get() as any)._controller as AbortController | undefined;
      controller?.abort();
      set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
      set((s) => ({ ...s, _controller: undefined }) as any);
    },

    async editUserMessage(messageId, newContent, opts) {
      const chatId = get().selectedChatId!;
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'user') return;
      const updated = { ...target, content: newContent };
      set((s) => ({ messages: { ...s.messages, [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)) } }));
      await saveMessage(updated);
      if (opts?.rerun) {
        if (get().ui.isStreaming) get().stopStreaming();
        const nextAssistant = (get().messages[chatId] ?? []).slice(idx + 1).find((m) => m.role === 'assistant');
        if (nextAssistant) get().regenerateAssistantMessage(nextAssistant.id).catch(() => void 0);
      }
    },

    async editAssistantMessage(messageId, newContent) {
      const chatId = get().selectedChatId!;
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'assistant') return;
      const updated = { ...target, content: newContent } as Message;
      set((s) => ({ messages: { ...s.messages, [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)) } }));
      await saveMessage(updated);
    },

    async regenerateAssistantMessage(messageId, opts) {
      const useProxy = process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
      const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
      if (!key && !useProxy)
        return set((s) => ({ ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' } }));
      const chatId = get().selectedChatId!;
      const chat = get().chats.find((c) => c.id === chatId)!;
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const payloadBefore = buildChatCompletionMessages({ chat, priorMessages: list.slice(0, idx), models: get().models });
      const replacement: Message = { id: messageId, chatId, role: 'assistant', content: '', createdAt: list[idx].createdAt, model: opts?.modelId || chat.settings.model, reasoning: '' };
      set((s) => ({ messages: { ...s.messages, [chatId]: list.map((m) => (m.id === messageId ? replacement : m)) }, ui: { ...s.ui, isStreaming: true } }));
      const msgs = payloadBefore;
      try {
        const controller = new AbortController();
        set((s) => ({ ...s, _controller: controller as any }) as any);
        const tStart = performance.now();
        let tFirst: number | undefined;
        await streamChatCompletion({
          apiKey: key || '',
          model: replacement.model!,
          messages: msgs,
          temperature: chat.settings.temperature,
          top_p: chat.settings.top_p,
          max_tokens: chat.settings.max_tokens,
          reasoning_effort: chat.settings.reasoning_effort,
          reasoning_tokens: chat.settings.reasoning_tokens,
          signal: controller.signal,
          callbacks: {
            onToken: (delta) => {
              if (tFirst == null) tFirst = performance.now();
              set((s) => {
                const list2 = s.messages[chatId] ?? [];
                const updated = list2.map((m) => (m.id === replacement.id ? { ...m, content: m.content + delta } : m));
                return { messages: { ...s.messages, [chatId]: updated } } as any;
              });
            },
            onReasoningToken: (delta) => {
              set((s) => {
                const list2 = s.messages[chatId] ?? [];
                const updated = list2.map((m) => (m.id === replacement.id ? { ...m, reasoning: (m.reasoning || '') + delta } : m));
                return { messages: { ...s.messages, [chatId]: updated } } as any;
              });
            },
            onDone: async (full, extras) => {
              set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
              const current = get().messages[chatId]?.find((m) => m.id === replacement.id);
              const tEnd = performance.now();
              const ttftMs = tFirst ? Math.max(0, Math.round(tFirst - tStart)) : undefined;
              const completionMs = Math.max(0, Math.round(tEnd - tStart));
              const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
              const completionTokens = extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
              const tokensPerSec = completionTokens && completionMs ? +(completionTokens / (completionMs / 1000)).toFixed(2) : undefined;
              const final = { ...replacement, content: full, reasoning: current?.reasoning, metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec }, tokensIn: promptTokens, tokensOut: completionTokens } as any;
              set((s) => {
                const list3 = s.messages[chatId] ?? [];
                const updated = list3.map((m) => (m.id === replacement.id ? final : m));
                return { messages: { ...s.messages, [chatId]: updated } } as any;
              });
              await saveMessage(final);
              set((s) => ({ ...s, _controller: undefined }) as any);
            },
            onError: (err) => {
              set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
              set((s) => ({ ...s, _controller: undefined }) as any);
            },
          },
        });
      } catch (e: any) {
        if (e?.message === 'unauthorized') set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
        if (e?.message === 'rate_limited') set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' } }));
        set((s) => ({ ...s, _controller: undefined }) as any);
      }
    },
  } satisfies Partial<StoreState>;
}
