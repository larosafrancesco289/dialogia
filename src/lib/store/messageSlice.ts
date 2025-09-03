import { v4 as uuidv4 } from 'uuid';
import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { saveMessage } from '@/lib/db';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { stripLeadingToolJson } from '@/lib/agent/streaming';
import {
  streamChatCompletion,
  chatCompletion,
  fetchZdrModelIds,
  fetchZdrProviderIds,
} from '@/lib/openrouter';
import { isReasoningSupported, findModelById, isVisionSupported } from '@/lib/models';
import { MAX_FALLBACK_RESULTS } from '@/lib/constants';

export function createMessageSlice(
  set: (updater: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  return {
    async appendAssistantMessage(content: string, opts?: { modelId?: string }) {
      const chatId = get().selectedChatId!;
      const chat = get().chats.find((c) => c.id === chatId)!;
      const now = Date.now();
      const assistantMsg: Message = {
        id: uuidv4(),
        chatId,
        role: 'assistant',
        content,
        createdAt: now,
        model: opts?.modelId || chat.settings.model,
        reasoning: '',
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] ?? []), assistantMsg],
        },
      }));
      await saveMessage(assistantMsg);
    },
    async sendUserMessage(
      content: string,
      opts?: { attachments?: import('@/lib/types').Attachment[] },
    ) {
      const useProxy = process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
      const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
      if (!key && !useProxy)
        return set((s) => ({
          ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
        }));
      const chatId = get().selectedChatId!;
      const chat = get().chats.find((c) => c.id === chatId)!;
      // If attachments provided but model lacks vision support, drop them and inform
      const modelMetaVisionCheck = findModelById(get().models, chat.settings.model);
      const canVision = isVisionSupported(modelMetaVisionCheck);
      const rawAttachments = (opts?.attachments || []).filter((a) =>
        a.kind === 'image' ? canVision : a.kind === 'pdf',
      );
      // Convert PDF Files to data URLs on-the-fly for OpenRouter file blocks.
      const toDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(file);
        });
      const attachments = await Promise.all(
        rawAttachments.map(async (a) => {
          if (a.kind === 'pdf' && a.file && !a.dataURL) {
            try {
              const dataURL = await toDataUrl(a.file);
              return { ...a, dataURL };
            } catch {
              return a;
            }
          }
          return a;
        }),
      );
      // Strict ZDR enforcement: block sending to non-ZDR models when enabled
      if (get().ui.zdrOnly !== false) {
        const modelId = chat.settings.model;
        let allowedModelIds = new Set(get().zdrModelIds || []);
        if (allowedModelIds.size === 0) {
          try {
            allowedModelIds = await fetchZdrModelIds();
            set({ zdrModelIds: Array.from(allowedModelIds) } as any);
          } catch {}
        }
        if (allowedModelIds.size > 0) {
          if (!allowedModelIds.has(modelId)) {
            return set((s) => ({
              ui: {
                ...s.ui,
                notice: `ZDR-only is enabled. The selected model (\n${modelId}\n) is not ZDR. Choose a ZDR model in Settings.`,
              },
            }));
          }
        } else {
          // Fallback to provider-based allowance when explicit list unavailable
          let providers = new Set(get().zdrProviderIds || []);
          if (providers.size === 0) {
            try {
              providers = await fetchZdrProviderIds();
              set({ zdrProviderIds: Array.from(providers) } as any);
            } catch {}
          }
          const providerPrefix = (modelId || '').split('/')[0];
          if (!providerPrefix || !providers.has(providerPrefix)) {
            return set((s) => ({
              ui: {
                ...s.ui,
                notice: `ZDR-only is enabled. The selected model (\n${modelId}\n) is not from a ZDR provider. Choose a ZDR model in Settings.`,
              },
            }));
          }
        }
      }
      const now = Date.now();
      const userMsg: Message = {
        id: uuidv4(),
        chatId,
        role: 'user',
        content,
        createdAt: now,
        // Persist without heavy/binary fields for PDFs
        attachments:
          attachments.length
            ? attachments.map((a) =>
                a.kind === 'pdf'
                  ? { id: a.id, kind: 'pdf', name: a.name, mime: a.mime, size: a.size }
                  : a,
              )
            : undefined,
      };
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
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] ?? []), userMsg, assistantMsg],
        },
        ui: { ...s.ui, isStreaming: true },
      }));
      await saveMessage(userMsg);
      await saveMessage(assistantMsg);

      const msgs = buildChatCompletionMessages({
        chat,
        priorMessages: priorList,
        models: get().models,
        newUserContent: content,
        newUserAttachments: attachments,
      });
      // Enable OpenRouter PDF parsing when PDFs are attached
      const hasPdf = attachments.some((a) => a.kind === 'pdf');
      const plugins = hasPdf ? [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] : undefined;
      if (chat.title === 'New Chat') {
        const draft = content.trim().slice(0, 40);
        await get().renameChat(chat.id, draft || 'New Chat');
      }

      const attemptToolUse = !!chat.settings.search_with_brave;
      const providerSort = get().ui.routePreference === 'cost' ? 'price' : 'throughput';
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
          const planningMessages: any[] = [
            planningSystem,
            ...msgs.filter((m) => m.role !== 'system'),
          ];
          let convo = planningMessages.slice();
          let rounds = 0;
          let finalContent: string | null = null;
          let finalUsage: any | undefined = undefined;
          let usedTool = false;
          let aggregatedResults: { title?: string; url?: string; description?: string }[] = [];
          const extractInlineWebSearchArgs = (
            text: string,
          ): { query: string; count?: number } | null => {
            try {
              const candidates: Array<Record<string, any>> = [];
              const jsonMatches = text.match(/\{[\s\S]*?\}/g) || [];
              for (const m of jsonMatches) {
                try {
                  candidates.push(JSON.parse(m));
                } catch {}
              }
              for (const c of candidates) {
                if (typeof c.query === 'string') {
                  const q = String(c.query).trim();
                  if (q) {
                    const cnt = Number.isFinite(c.count)
                      ? Math.max(1, Math.min(10, Math.floor(c.count)))
                      : undefined;
                    return { query: q, count: cnt };
                  }
                }
                if (typeof c.name === 'string' && c.name === 'web_search') {
                  const arg = c.arguments;
                  if (typeof arg === 'string') {
                    try {
                      const inner = JSON.parse(arg);
                      if (inner && typeof inner.query === 'string' && inner.query.trim()) {
                        const cnt = Number.isFinite(inner.count)
                          ? Math.max(1, Math.min(10, Math.floor(inner.count)))
                          : undefined;
                        return { query: inner.query.trim(), count: cnt };
                      }
                    } catch {}
                  } else if (arg && typeof arg === 'object' && typeof arg.query === 'string') {
                    const q = String(arg.query).trim();
                    if (q) {
                      const cnt = Number.isFinite(arg.count)
                        ? Math.max(1, Math.min(10, Math.floor(arg.count)))
                        : undefined;
                      return { query: q, count: cnt };
                    }
                  }
                }
              }
            } catch {}
            return null;
          };
          while (rounds < 3) {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const supportsReasoning = isReasoningSupported(modelMeta);
            const resp = await chatCompletion({
              apiKey: key || '',
              model: chat.settings.model,
              messages: convo as any,
              temperature: chat.settings.temperature,
              top_p: chat.settings.top_p,
              max_tokens: chat.settings.max_tokens,
              reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
              reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
              tools: toolDefinition as any,
              // Let the model decide whether to call the tool
              tool_choice: 'auto' as any,
              signal: controller.signal,
              providerSort,
              plugins,
            });
            finalUsage = resp?.usage;
            const choice = resp?.choices?.[0];
            const message = choice?.message || {};
            let toolCalls =
              Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
                ? message.tool_calls
                : message?.function_call
                  ? [
                      {
                        id: 'call_0',
                        type: 'function',
                        function: {
                          name: message.function_call.name,
                          arguments: message.function_call.arguments,
                        },
                      },
                    ]
                  : [];
            if ((!toolCalls || toolCalls.length === 0) && typeof message?.content === 'string') {
              const inline = extractInlineWebSearchArgs(message.content);
              if (inline)
                toolCalls = [
                  {
                    id: 'call_0',
                    type: 'function',
                    function: { name: 'web_search', arguments: JSON.stringify(inline) },
                  },
                ];
            }
            if (toolCalls && toolCalls.length > 0) {
              usedTool = true;
              convo.push({ role: 'assistant', content: null, tool_calls: toolCalls } as any);
            }
            // Do not force tool calls; only proceed when the model chooses to call tools
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
              const count = Math.min(
                Math.max(parseInt(String(args?.count || '5'), 10) || 5, 1),
                10,
              );
              if (!rawQuery) rawQuery = content.trim().slice(0, 256);
              set((s) => ({
                ui: {
                  ...s.ui,
                  braveByMessageId: {
                    ...(s.ui.braveByMessageId || {}),
                    [assistantMsg.id]: { query: rawQuery, status: 'loading' },
                  },
                },
              }));
              try {
                // Per-request controller with timeout, tied to the main controller as well
                const fetchController = new AbortController();
                const onAbort = () => fetchController.abort();
                controller.signal.addEventListener('abort', onAbort);
                const to = setTimeout(() => fetchController.abort(), 20000);
                const res = await fetch(
                  `/api/brave?q=${encodeURIComponent(rawQuery)}&count=${count}`,
                  {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    cache: 'no-store',
                    signal: fetchController.signal,
                  } as any,
                );
                clearTimeout(to);
                controller.signal.removeEventListener('abort', onAbort);
                if (res.ok) {
                  const data: any = await res.json();
                  const results = (data?.results || []) as any[];
                  set((s) => ({
                    ui: {
                      ...s.ui,
                      braveByMessageId: {
                        ...(s.ui.braveByMessageId || {}),
                        [assistantMsg.id]: { query: rawQuery, status: 'done', results },
                      },
                    },
                  }));
                  aggregatedResults = results;
                  const lines = results
                    .slice(0, MAX_FALLBACK_RESULTS)
                    .map(
                      (r, i) =>
                        `${i + 1}. ${(r.title || r.url || 'Result').toString()} — ${r.url || ''}${r.description ? ` — ${r.description}` : ''}`,
                    )
                    .join('\n');
                  convo.push({
                    role: 'tool',
                    name: 'web_search',
                    tool_call_id: tc.id,
                    content: `Web search results for: ${rawQuery}\n\n${lines}`,
                  } as any);
                } else {
                  if (res.status === 400)
                    set((s) => ({ ui: { ...s.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
                  convo.push({
                    role: 'tool',
                    name: 'web_search',
                    tool_call_id: tc.id,
                    content: 'No results',
                  } as any);
                }
              } catch {
                set((s) => ({
                  ui: {
                    ...s.ui,
                    braveByMessageId: {
                      ...(s.ui.braveByMessageId || {}),
                      [assistantMsg.id]: {
                        query: rawQuery,
                        status: 'error',
                        results: [],
                        error: 'Network error',
                      },
                    },
                  },
                }));
                convo.push({
                  role: 'tool',
                  name: 'web_search',
                  tool_call_id: tc.id,
                  content: 'No results',
                } as any);
              }
            }
            convo.push({
              role: 'user',
              content: 'Write the final answer. Cite sources inline as [n].',
            } as any);
            rounds++;
          }
          // Stream the final answer using planning context (optionally including search results)
          const baseSystem =
            combinedSystemForThisTurn || chat.settings.system || 'You are a helpful assistant.';
          const linesForSystem = (aggregatedResults || [])
            .slice(0, MAX_FALLBACK_RESULTS)
            .map(
              (r, i) =>
                `${i + 1}. ${(r.title || r.url || 'Result').toString()} — ${r.url || ''}${r.description ? ` — ${r.description}` : ''}`,
            )
            .join('\n');
          const sourcesBlock =
            usedTool && linesForSystem
              ? `\n\nWeb search results (Brave):\n${linesForSystem}\n\nInstructions: Use these results to answer and cite sources inline as [n].`
              : '';
          const finalSystem = `${baseSystem}${sourcesBlock}`;
          const streamingMessages = (
            [{ role: 'system', content: finalSystem } as const] as any[]
          ).concat(msgs.filter((m) => m.role !== 'system'));

          const tStartPlan = performance.now();
          let tFirstPlan: number | undefined;
          let startedStreamingContentPlan = true; // content should be user-facing now
          let leadingBufferPlan = '';
          {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const supportsReasoning = isReasoningSupported(modelMeta);
      await streamChatCompletion({
        apiKey: key || '',
        model: chat.settings.model,
        messages: streamingMessages,
        temperature: chat.settings.temperature,
        top_p: chat.settings.top_p,
        max_tokens: chat.settings.max_tokens,
        reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
        reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
        signal: controller.signal,
        providerSort,
        plugins,
        callbacks: {
                onToken: (delta) => {
                  if (tFirstPlan == null) tFirstPlan = performance.now();
                  if (!startedStreamingContentPlan) {
                    leadingBufferPlan += delta;
                    const hasStructure =
                      leadingBufferPlan.trimStart().startsWith('{') ||
                      leadingBufferPlan.trimStart().startsWith('```');
                    if (hasStructure) {
                      const stripped = stripLeadingToolJson(leadingBufferPlan);
                      const rest = stripped.trimStart();
                      if (rest && !(rest.startsWith('{') || rest.startsWith('```'))) {
                        startedStreamingContentPlan = true;
                        const toEmit = stripped;
                        leadingBufferPlan = '';
                        set((s) => {
                          const list = s.messages[chatId] ?? [];
                          const updated = list.map((m) =>
                            m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                          );
                          return { messages: { ...s.messages, [chatId]: updated } } as any;
                        });
                      }
                    } else if (leadingBufferPlan.length > 512) {
                      startedStreamingContentPlan = true;
                      const toEmit = leadingBufferPlan;
                      leadingBufferPlan = '';
                      set((s) => {
                        const list = s.messages[chatId] ?? [];
                        const updated = list.map((m) =>
                          m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                        );
                        return { messages: { ...s.messages, [chatId]: updated } } as any;
                      });
                    }
                  } else {
                    set((s) => {
                      const list = s.messages[chatId] ?? [];
                      const updated = list.map((m) =>
                        m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m,
                      );
                      return { messages: { ...s.messages, [chatId]: updated } } as any;
                    });
                  }
                },
                onReasoningToken: (delta) => {
                  if (tFirstPlan == null) tFirstPlan = performance.now();
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, reasoning: (m.reasoning || '') + delta }
                        : m,
                    );
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                },
                onDone: async (full, extras) => {
                  set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
                  const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
                  const tEnd = performance.now();
                  const ttftMs = tFirstPlan
                    ? Math.max(0, Math.round(tFirstPlan - tStartPlan))
                    : undefined;
                  const completionMs = Math.max(0, Math.round(tEnd - tStartPlan));
                  const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
                  const completionTokens =
                    extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                  const tokensPerSec =
                    completionTokens && completionMs
                      ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                      : undefined;
                  const finalMsg = {
                    ...assistantMsg,
                    content: stripLeadingToolJson(full || ''),
                    reasoning: current?.reasoning,
                    metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                    tokensIn: promptTokens,
                    tokensOut: completionTokens,
                  } as any;
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) => (m.id === assistantMsg.id ? finalMsg : m));
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                  await saveMessage(finalMsg);
                  set((s) => ({ ...s, _controller: undefined }) as any);
                },
                onError: (err) => {
                  set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
                  set((s) => ({ ...s, _controller: undefined }) as any);
                },
              },
            });
          }
          return;
        } catch (e: any) {
          if (e?.message === 'unauthorized')
            set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
          if (e?.message === 'rate_limited')
            set((s) => ({
              ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
            }));
          set((s) => ({ ...s, _controller: undefined }) as any);
          return;
        }
      }

      try {
        const controller = new AbortController();
        set((s) => ({ ...s, _controller: controller as any }) as any);
        const tStart = performance.now();
        let tFirst: number | undefined;
        // No automatic fallback web search; the model will call the tool when necessary
        const streamingMessages = msgs;
        let startedStreamingContent = attemptToolUse ? false : true;
        let leadingBuffer = '';
        {
          const modelMeta = findModelById(get().models, chat.settings.model);
          const supportsReasoning = isReasoningSupported(modelMeta);
          await streamChatCompletion({
            apiKey: key || '',
            model: chat.settings.model,
            messages: streamingMessages,
            temperature: chat.settings.temperature,
            top_p: chat.settings.top_p,
            max_tokens: chat.settings.max_tokens,
            reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
            reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
            signal: controller.signal,
            providerSort,
            plugins,
            callbacks: {
              onToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                if (!startedStreamingContent) {
                  leadingBuffer += delta;
                  const hasStructure =
                    leadingBuffer.trimStart().startsWith('{') ||
                    leadingBuffer.trimStart().startsWith('```');
                  if (hasStructure) {
                    const stripped = stripLeadingToolJson(leadingBuffer);
                    const rest = stripped.trimStart();
                    if (rest && !(rest.startsWith('{') || rest.startsWith('```'))) {
                      startedStreamingContent = true;
                      const toEmit = stripped;
                      leadingBuffer = '';
                      set((s) => {
                        const list = s.messages[chatId] ?? [];
                        const updated = list.map((m) =>
                          m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                        );
                        return { messages: { ...s.messages, [chatId]: updated } } as any;
                      });
                    }
                  } else if (leadingBuffer.length > 512) {
                    startedStreamingContent = true;
                    const toEmit = leadingBuffer;
                    leadingBuffer = '';
                    set((s) => {
                      const list = s.messages[chatId] ?? [];
                      const updated = list.map((m) =>
                        m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                      );
                      return { messages: { ...s.messages, [chatId]: updated } } as any;
                    });
                  }
                } else {
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) =>
                      m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m,
                    );
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                }
              },
              onReasoningToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) =>
                    m.id === assistantMsg.id ? { ...m, reasoning: (m.reasoning || '') + delta } : m,
                  );
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
                const completionTokens =
                  extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                const tokensPerSec =
                  completionTokens && completionMs
                    ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                    : undefined;
                const final = {
                  ...assistantMsg,
                  content: stripLeadingToolJson(full || ''),
                  reasoning: current?.reasoning,
                  metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                  tokensIn: promptTokens,
                  tokensOut: completionTokens,
                } as any;
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
        }
      } catch (e: any) {
        if (e?.message === 'unauthorized')
          set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
        if (e?.message === 'rate_limited')
          set((s) => ({
            ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
          }));
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
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)),
        },
      }));
      await saveMessage(updated);
      if (opts?.rerun) {
        if (get().ui.isStreaming) get().stopStreaming();
        const nextAssistant = (get().messages[chatId] ?? [])
          .slice(idx + 1)
          .find((m) => m.role === 'assistant');
        if (nextAssistant)
          get()
            .regenerateAssistantMessage(nextAssistant.id)
            .catch(() => void 0);
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
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)),
        },
      }));
      await saveMessage(updated);
    },

    async regenerateAssistantMessage(messageId, opts) {
      const useProxy = process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
      const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
      if (!key && !useProxy)
        return set((s) => ({
          ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
        }));
      const chatId = get().selectedChatId!;
      const chat = get().chats.find((c) => c.id === chatId)!;
      // ZDR enforcement for regenerate with provider fallback
      if (get().ui.zdrOnly !== false) {
        const modelId = opts?.modelId || chat.settings.model;
        let allowedModelIds = new Set(get().zdrModelIds || []);
        if (allowedModelIds.size === 0) {
          try {
            allowedModelIds = await fetchZdrModelIds();
            set({ zdrModelIds: Array.from(allowedModelIds) } as any);
          } catch {}
        }
        if (allowedModelIds.size > 0) {
          if (!allowedModelIds.has(modelId)) {
            return set((s) => ({
              ui: {
                ...s.ui,
                notice: `ZDR-only is enabled. The selected model (\n${modelId}\n) is not ZDR. Choose a ZDR model in Settings.`,
              },
            }));
          }
        } else {
          let providers = new Set(get().zdrProviderIds || []);
          if (providers.size === 0) {
            try {
              providers = await fetchZdrProviderIds();
              set({ zdrProviderIds: Array.from(providers) } as any);
            } catch {}
          }
          const providerPrefix = (modelId || '').split('/')[0];
          if (!providerPrefix || !providers.has(providerPrefix)) {
            return set((s) => ({
              ui: {
                ...s.ui,
                notice: `ZDR-only is enabled. The selected model (\n${modelId}\n) is not from a ZDR provider. Choose a ZDR model in Settings.`,
              },
            }));
          }
        }
      }
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const payloadBefore = buildChatCompletionMessages({
        chat,
        priorMessages: list.slice(0, idx),
        models: get().models,
      });
      const replacement: Message = {
        id: messageId,
        chatId,
        role: 'assistant',
        content: '',
        createdAt: list[idx].createdAt,
        model: opts?.modelId || chat.settings.model,
        reasoning: '',
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: list.map((m) => (m.id === messageId ? replacement : m)),
        },
        ui: { ...s.ui, isStreaming: true },
      }));
      const msgs = payloadBefore;
      try {
        const controller = new AbortController();
        set((s) => ({ ...s, _controller: controller as any }) as any);
        const tStart = performance.now();
        let tFirst: number | undefined;
        {
          const modelMeta = findModelById(get().models, replacement.model!);
          const supportsReasoning = isReasoningSupported(modelMeta);
          await streamChatCompletion({
            apiKey: key || '',
            model: replacement.model!,
            messages: msgs,
            temperature: chat.settings.temperature,
            top_p: chat.settings.top_p,
            max_tokens: chat.settings.max_tokens,
            reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
            reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
            signal: controller.signal,
            callbacks: {
              onToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) =>
                    m.id === replacement.id ? { ...m, content: m.content + delta } : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              },
              onReasoningToken: (delta) => {
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) =>
                    m.id === replacement.id ? { ...m, reasoning: (m.reasoning || '') + delta } : m,
                  );
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
                const completionTokens =
                  extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                const tokensPerSec =
                  completionTokens && completionMs
                    ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                    : undefined;
                const final = {
                  ...replacement,
                  content: full,
                  reasoning: current?.reasoning,
                  metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                  tokensIn: promptTokens,
                  tokensOut: completionTokens,
                } as any;
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
        }
      } catch (e: any) {
        if (e?.message === 'unauthorized')
          set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
        if (e?.message === 'rate_limited')
          set((s) => ({
            ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
          }));
        set((s) => ({ ...s, _controller: undefined }) as any);
      }
    },
  } satisfies Partial<StoreState>;
}
