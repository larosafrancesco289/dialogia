import { v4 as uuidv4 } from 'uuid';
import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { saveMessage, saveChat } from '@/lib/db';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { stripLeadingToolJson } from '@/lib/agent/streaming';
import { streamChatCompletion, chatCompletion } from '@/lib/openrouter';
import {
  getTutorPreamble,
  getTutorToolDefinitions,
  buildTutorContextSummary,
  buildTutorContextFull,
} from '@/lib/agent/tutor';
import {
  updateTutorMemory,
  normalizeTutorMemory,
  getTutorMemoryFrequency,
  EMPTY_TUTOR_MEMORY,
} from '@/lib/agent/tutorMemory';
import { runDeepResearchTurn } from '@/lib/agent/deepResearchOrchestrator';
import { loadTutorProfile, summarizeTutorProfile } from '@/lib/tutorProfile';
import { addCardsToDeck, getDueCards } from '@/lib/tutorDeck';
import {
  isReasoningSupported,
  findModelById,
  isToolCallingSupported,
  isImageOutputSupported,
} from '@/lib/models';
import {
  MAX_FALLBACK_RESULTS,
  DEFAULT_TUTOR_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_MODEL_ID,
} from '@/lib/constants';
import { getPublicOpenRouterKey, isOpenRouterProxyEnabled } from '@/lib/config';
import {
  checkZdrModelAllowance,
  ensureZdrLists,
  evaluateZdrModel,
  getZdrBlockNotice,
  toZdrState,
  ZDR_UNAVAILABLE_NOTICE,
} from '@/lib/zdr';
import { prepareAttachmentsForModel } from '@/lib/agent/attachments';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import {
  extractTutorToolCalls,
  extractWebSearchArgs,
  normalizeTutorQuizPayload,
} from '@/lib/agent/tools';
// telemetry removed for commit cleanliness

export function createMessageSlice(
  set: (updater: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  const ensureZdrAllowed = async (modelId: string): Promise<boolean> => {
    const { lists, check } = await checkZdrModelAllowance(modelId, {
      modelIds: get().zdrModelIds,
      providerIds: get().zdrProviderIds,
    });
    set(toZdrState(lists) as any);
    if (lists.modelIds.size === 0 && lists.providerIds.size === 0) {
      set((s) => ({ ui: { ...s.ui, notice: ZDR_UNAVAILABLE_NOTICE } }));
      return false;
    }
    if (check.status === 'unknown') {
      set((s) => ({ ui: { ...s.ui, notice: ZDR_UNAVAILABLE_NOTICE } }));
      return false;
    }
    if (check.status === 'forbidden') {
      set((s) => ({
        ui: { ...s.ui, notice: getZdrBlockNotice(modelId, check.reason) },
      }));
      return false;
    }
    return true;
  };

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

    async persistTutorStateForMessage(messageId) {
      const st = get();
      const uiTutor = st.ui.tutorByMessageId?.[messageId];
      if (!uiTutor) return;
      let updatedMsg: any | undefined;
      for (const [cid, list] of Object.entries(st.messages)) {
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          const target = list[idx];
          let hidden = '';
          try {
            const recap = buildTutorContextSummary(uiTutor as any);
            const json = buildTutorContextFull(uiTutor as any);
            const parts: string[] = [];
            if (recap) parts.push(`Tutor Recap:\n${recap}`);
            if (json) parts.push(`Tutor Data JSON:\n${json}`);
            hidden = parts.join('\n\n');
          } catch {}
          // Replace hiddenContent for this assistant message (do not append repeatedly)
          const nm = { ...target, tutor: uiTutor, hiddenContent: hidden } as any;
          set((s) => ({
            messages: {
              ...s.messages,
              [cid]: list.map((m) => (m.id === messageId ? nm : m)),
            },
          }));
          updatedMsg = nm;
          break;
        }
      }
      try {
        if (updatedMsg) await saveMessage(updatedMsg);
      } catch {}
    },
    async sendUserMessage(
      content: string,
      opts?: { attachments?: import('@/lib/types').Attachment[] },
    ) {
      const useProxy = isOpenRouterProxyEnabled();
      const key = getPublicOpenRouterKey();
      if (!key && !useProxy)
        return set((s) => ({
          ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
        }));
      const chatId = get().selectedChatId!;
      let chat = get().chats.find((c) => c.id === chatId)!;
      const uiState = get().ui;
      const tutorGloballyEnabled = !!uiState.experimentalTutor;
      const forceTutorMode = !!(uiState.forceTutorMode ?? false);
      const tutorEnabled = tutorGloballyEnabled && (forceTutorMode || !!chat.settings.tutor_mode);
      let tutorDefaultModelId = uiState.tutorDefaultModelId || chat.settings.tutor_default_model;
      let tutorMemoryModelId =
        uiState.tutorMemoryModelId ||
        chat.settings.tutor_memory_model ||
        tutorDefaultModelId ||
        DEFAULT_TUTOR_MEMORY_MODEL_ID;
      if (!tutorDefaultModelId) tutorDefaultModelId = DEFAULT_TUTOR_MODEL_ID;
      if (!tutorMemoryModelId) tutorMemoryModelId = DEFAULT_TUTOR_MEMORY_MODEL_ID;
      const memoryAutoUpdateEnabled =
        uiState.tutorMemoryAutoUpdate !== false && chat.settings.tutor_memory_disabled !== true;
      if (tutorEnabled) {
        const updatedSettings = { ...chat.settings };
        let settingsChanged = false;
        if (updatedSettings.model !== tutorDefaultModelId) {
          updatedSettings.model = tutorDefaultModelId;
          settingsChanged = true;
        }
        if (updatedSettings.tutor_default_model !== tutorDefaultModelId) {
          updatedSettings.tutor_default_model = tutorDefaultModelId;
          settingsChanged = true;
        }
        if (updatedSettings.tutor_memory_model !== tutorMemoryModelId) {
          updatedSettings.tutor_memory_model = tutorMemoryModelId;
          settingsChanged = true;
        }
        const normalizedMem = normalizeTutorMemory(updatedSettings.tutor_memory);
        if (normalizedMem !== updatedSettings.tutor_memory) {
          updatedSettings.tutor_memory = normalizedMem;
          settingsChanged = true;
        }
        if (
          typeof updatedSettings.tutor_memory_frequency !== 'number' ||
          updatedSettings.tutor_memory_frequency <= 0
        ) {
          updatedSettings.tutor_memory_frequency = getTutorMemoryFrequency(updatedSettings);
          settingsChanged = true;
        }
        if (
          typeof updatedSettings.tutor_memory_message_count !== 'number' ||
          updatedSettings.tutor_memory_message_count < 0
        ) {
          updatedSettings.tutor_memory_message_count = 0;
          settingsChanged = true;
        }
        if (settingsChanged) {
          const updatedChat = { ...chat, settings: updatedSettings, updatedAt: Date.now() };
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
          chat = updatedChat;
          try {
            await saveChat(updatedChat);
          } catch {}
        }
        tutorDefaultModelId = chat.settings.tutor_default_model || tutorDefaultModelId;
        tutorMemoryModelId = chat.settings.tutor_memory_model || tutorMemoryModelId;
      }
      const activeModelId = chat.settings.model;
      const attachments = await prepareAttachmentsForModel({
        attachments: opts?.attachments,
        modelId: activeModelId,
        models: get().models,
      });
      // Determine if any PDFs exist in conversation (prior or this turn) to enable parser plugin
      if (tutorEnabled) {
        try {
          const maybePromise = (get().prepareTutorWelcomeMessage as any)(chatId);
          // Fire-and-forget so tutor welcome generation does not block user sends
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.catch(() => {});
          }
        } catch {}
      }
      const priorList = get().messages[chatId] ?? [];
      const hadPdfEarlier = priorList.some(
        (m) => Array.isArray(m.attachments) && m.attachments.some((x: any) => x?.kind === 'pdf'),
      );
      const hasPdf = attachments.some((a) => a.kind === 'pdf') || hadPdfEarlier;
      // Strict ZDR enforcement: block sending to non-ZDR models when enabled
      if (get().ui.zdrOnly === true) {
        const allowed = await ensureZdrAllowed(activeModelId);
        if (!allowed) return;
      }
      const now = Date.now();
      const userMsg: Message = {
        id: uuidv4(),
        chatId,
        role: 'user',
        content,
        createdAt: now,
        // Persist full attachments for statefulness across turns (PDF dataURL included)
        attachments: attachments.length ? attachments : undefined,
      };
      const assistantMsg: Message = {
        id: uuidv4(),
        chatId,
        role: 'assistant',
        content: '',
        createdAt: now + 1,
        model: activeModelId,
        reasoning: '',
        attachments: [],
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] ?? []), userMsg, assistantMsg],
        },
        ui: { ...s.ui, isStreaming: true },
      }));
      await saveMessage(userMsg);
      await saveMessage(assistantMsg);

      if (get().ui.experimentalDeepResearch && get().ui.nextDeepResearch) {
        const handled = await runDeepResearchTurn({
          task: content,
          modelId: activeModelId,
          chatId,
          assistantMessage: assistantMsg,
          set,
          get,
          persistMessage: saveMessage,
        });
        if (handled) return;
      }

      let memoryDebug:
        | {
            before?: string;
            after?: string;
            version?: number;
            messageCount?: number;
            conversationWindow?: string;
            raw?: string;
          }
        | undefined;
      if (tutorEnabled && memoryAutoUpdateEnabled) {
        const settings = chat.settings;
        const priorCount = settings.tutor_memory_message_count ?? 0;
        const frequency = getTutorMemoryFrequency(settings);
        const nextCount = priorCount + 1;
        let newCount = nextCount;
        let newMemory = settings.tutor_memory || EMPTY_TUTOR_MEMORY;
        let version = settings.tutor_memory_version ?? 0;
        if (nextCount >= frequency) {
          try {
            const result = await updateTutorMemory({
              apiKey: key || '',
              model: tutorMemoryModelId,
              existingMemory: settings.tutor_memory,
              conversation: priorList.concat(userMsg),
              frequency,
            });
            newMemory = result.memory;
            version += 1;
            newCount = 0;
            memoryDebug = {
              before: settings.tutor_memory,
              after: newMemory,
              version,
              messageCount: nextCount,
              conversationWindow: result.conversationWindow,
              raw: result.raw,
            };
          } catch (err: any) {
            set((s) => ({
              ui: {
                ...s.ui,
                notice:
                  s.ui.debugMode && err?.message
                    ? `Tutor memory update failed: ${String(err.message)}`
                    : s.ui.notice,
              },
            }));
          }
        }
        if (
          newCount !== priorCount ||
          newMemory !== settings.tutor_memory ||
          version !== (settings.tutor_memory_version ?? 0)
        ) {
          const updatedSettings = {
            ...chat.settings,
            tutor_memory: newMemory,
            tutor_memory_version: version,
            tutor_memory_message_count: newCount,
          };
          const updatedChat = { ...chat, settings: updatedSettings, updatedAt: Date.now() };
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
          chat = updatedChat;
          try {
            await saveChat(updatedChat);
          } catch {}
        }
      } else if (tutorEnabled && !memoryAutoUpdateEnabled) {
        const priorCount = chat.settings.tutor_memory_message_count ?? 0;
        const nextCount = priorCount + 1;
        if (nextCount !== priorCount) {
          const updatedSettings = {
            ...chat.settings,
            tutor_memory_message_count: nextCount,
          };
          const updatedChat = { ...chat, settings: updatedSettings, updatedAt: Date.now() };
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
          chat = updatedChat;
          try {
            await saveChat(updatedChat);
          } catch {}
        }
      }

      if (tutorEnabled) {
        const snapshot = {
          version: chat.settings.tutor_memory_version,
          messageCount: chat.settings.tutor_memory_message_count,
          after: chat.settings.tutor_memory,
          before: memoryDebug?.before,
          raw: memoryDebug?.raw,
          conversationWindow: memoryDebug?.conversationWindow,
          updatedAt: memoryDebug ? Date.now() : undefined,
          model: tutorMemoryModelId,
        };
        set((s) => ({
          ui: {
            ...s.ui,
            tutorGlobalMemory: chat.settings.tutor_memory || s.ui.tutorGlobalMemory,
            tutorMemoryDebugByMessageId: {
              ...(s.ui.tutorMemoryDebugByMessageId || {}),
              [assistantMsg.id]: snapshot,
            },
          },
        }));
      }

      const msgs = buildChatCompletionMessages({
        chat,
        priorMessages: priorList,
        models: get().models,
        newUserContent: content,
        newUserAttachments: attachments,
      });
      // Enable OpenRouter PDF parsing when any PDFs exist in the conversation
      const plugins = hasPdf ? [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] : undefined;
      if (chat.title === 'New Chat') {
        const draft = content.trim().slice(0, 40);
        await get().renameChat(chat.id, draft || 'New Chat');
      }

      const searchEnabled = !!chat.settings.search_with_brave;
      const braveGloballyEnabled = !!get().ui.experimentalBrave;
      const configuredProvider: 'brave' | 'openrouter' = (((chat.settings as any)
        ?.search_provider as any) || 'brave') as any;
      const searchProvider: 'brave' | 'openrouter' = braveGloballyEnabled
        ? configuredProvider
        : 'openrouter';
      const attemptPlanning = tutorEnabled || (searchEnabled && searchProvider === 'brave');
      const providerSort = get().ui.routePreference === 'cost' ? 'price' : 'throughput';
      const toolPreambleText =
        'You have access to a function tool named "web_search" that retrieves up-to-date web results.\n\nWhen you need current, factual, or source-backed information, call the tool first. If you call a tool, respond with ONLY tool_calls (no user-facing text). After the tool returns, write the final answer that cites sources inline as [n] using the numbering provided.\n\nweb_search(args): { query: string, count?: integer 1-10 }. Choose a focused query and a small count, and avoid unnecessary calls.';
      const tutorPreambleText = tutorGloballyEnabled ? getTutorPreamble() : '';
      const tutorMemoryBlock = tutorEnabled
        ? normalizeTutorMemory(chat.settings.tutor_memory)
        : undefined;
      const preambles: string[] = [];
      if (tutorMemoryBlock) preambles.push(tutorMemoryBlock);
      if (searchEnabled && searchProvider === 'brave') preambles.push(toolPreambleText);
      if (tutorEnabled && tutorPreambleText) preambles.push(tutorPreambleText);
      if (tutorEnabled) {
        try {
          const prof = await loadTutorProfile(chat.id);
          const summary = summarizeTutorProfile(prof);
          if (summary) preambles.push(`Learner Profile:\n${summary}`);
        } catch {}
        // Include steering preference once, then clear it
        if (get().ui.nextTutorNudge) {
          const n = get().ui.nextTutorNudge!;
          preambles.push(`Learner Preference: ${n.replace(/_/g, ' ')}`);
          set((s) => ({ ui: { ...s.ui, nextTutorNudge: undefined } }));
        }
      }
      const combinedSystemForThisTurn = attemptPlanning
        ? (preambles.join('\n\n') || undefined) &&
          (chat.settings.system && chat.settings.system.trim()
            ? `${preambles.join('\n\n')}\n\n${chat.settings.system}`
            : preambles.join('\n\n'))
        : undefined;
      if (attemptPlanning) {
        try {
          const controller = new AbortController();
          set((s) => ({ ...s, _controller: controller as any }) as any);
          const tutorTools = tutorEnabled ? (getTutorToolDefinitions() as any[]) : ([] as any[]);
          const baseTools =
            searchEnabled && searchProvider === 'brave'
              ? [
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
                ]
              : [];
          const toolDefinition = [...baseTools, ...tutorTools];
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
          let usedTutorTool = false; // any tutor tool call (non-web)
          let usedTutorContentTool = false; // interactive content tools (quiz_*, flashcards)
          let aggregatedResults: { title?: string; url?: string; description?: string }[] = [];
          const attachTutorQuiz = async (args: any) => {
            const normalized = normalizeTutorQuizPayload(args);
            if (!normalized) return { ok: false };
            let updatedMsg: any | undefined;
            const mapKey = 'mcq';
            set((s) => {
              const keyId = assistantMsg.id;
              const normed = normalized.items;
              const nextTutorUi = {
                ...(s.ui.tutorByMessageId?.[keyId] || {}),
                title: s.ui.tutorByMessageId?.[keyId]?.title || args?.title,
                [mapKey]: [
                  ...(((s.ui.tutorByMessageId?.[keyId] as any)?.[mapKey] as any[]) || []),
                  ...normed,
                ],
              } as any;
              const list = s.messages[chatId] ?? [];
              const updated = list.map((m) => {
                if (m.id !== keyId) return m;
                const prevTutor = (m as any).tutor || {};
                const mergedTutor = {
                  ...prevTutor,
                  title: prevTutor.title || args?.title,
                  [mapKey]: [...(((prevTutor as any)[mapKey] as any[]) || []), ...normed],
                } as any;
                let hidden = '';
                try {
                  const recap = buildTutorContextSummary(mergedTutor);
                  const json = buildTutorContextFull(mergedTutor);
                  const parts: string[] = [];
                  if (recap) parts.push(`Tutor Recap:\n${recap}`);
                  if (json) parts.push(`Tutor Data JSON:\n${json}`);
                  hidden = parts.join('\n\n');
                } catch {}
                const next = { ...m, tutor: mergedTutor, hiddenContent: hidden } as any;
                updatedMsg = next;
                return next;
              });
              return {
                ui: {
                  ...s.ui,
                  tutorByMessageId: {
                    ...(s.ui.tutorByMessageId || {}),
                    [keyId]: nextTutorUi,
                  },
                },
                messages: { ...s.messages, [chatId]: updated },
              } as any;
            });
            try {
              if (updatedMsg) await saveMessage(updatedMsg);
            } catch {}
            try {
              const body: any = { items: normalized.items };
              if (typeof args?.title === 'string') body.title = args.title;
              return { ok: true, json: JSON.stringify(body) };
            } catch {}
            return { ok: true };
          };

          while (rounds < 3) {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const supportsReasoning = isReasoningSupported(modelMeta);
            const supportsTools = isToolCallingSupported(modelMeta);
            // Store debug payload for planning (non-streaming) request in tutor/plan mode
            try {
              const debugBody: any = {
                model: chat.settings.model,
                messages: convo,
                stream: false,
              };
              if (typeof chat.settings.temperature === 'number')
                debugBody.temperature = chat.settings.temperature;
              if (typeof chat.settings.top_p === 'number') debugBody.top_p = chat.settings.top_p;
              if (typeof chat.settings.max_tokens === 'number')
                debugBody.max_tokens = chat.settings.max_tokens;
              if (supportsReasoning) {
                const rc: any = {};
                if (typeof chat.settings.reasoning_effort === 'string')
                  rc.effort = chat.settings.reasoning_effort;
                if (typeof chat.settings.reasoning_tokens === 'number')
                  rc.max_tokens = chat.settings.reasoning_tokens;
                if (Object.keys(rc).length > 0) debugBody.reasoning = rc;
              }
              if (supportsTools) debugBody.tools = toolDefinition as any;
              if (supportsTools) debugBody.tool_choice = 'auto';
              if (providerSort === 'price' || providerSort === 'throughput') {
                debugBody.provider = { sort: providerSort };
              }
              // Avoid PDF parsing costs during planning; only enable plugins in final streaming call
              // so PDFs are parsed once per user turn.
              // (Leave out debugBody.plugins here.)
              if (get().ui.debugMode) {
                set((s) => ({
                  ui: {
                    ...s.ui,
                    debugByMessageId: {
                      ...(s.ui.debugByMessageId || {}),
                      [assistantMsg.id]: {
                        body: JSON.stringify(debugBody, null, 2),
                        createdAt: Date.now(),
                      },
                    },
                  },
                }));
              }
            } catch {}
            const resp = await chatCompletion({
              apiKey: key || '',
              model: chat.settings.model,
              messages: convo as any,
              temperature: chat.settings.temperature,
              top_p: chat.settings.top_p,
              max_tokens: chat.settings.max_tokens,
              reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
              reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
              tools: supportsTools ? (toolDefinition as any) : undefined,
              // Let the model decide whether to call the tool when supported
              tool_choice: supportsTools ? ('auto' as any) : undefined,
              signal: controller.signal,
              providerSort,
              // Intentionally omit plugins here to skip parsing PDFs during planning
              // (final streaming call will include plugins if needed)
              plugins: undefined,
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
              const inline = extractWebSearchArgs(message.content);
              if (inline) {
                toolCalls = [
                  {
                    id: 'call_0',
                    type: 'function',
                    function: { name: 'web_search', arguments: JSON.stringify(inline) },
                  },
                ];
              } else {
                const tutorCalls = extractTutorToolCalls(message.content);
                if (tutorCalls.length > 0) {
                  // Emulate function calls for tutor tools
                  toolCalls = tutorCalls.map((c, idx) => ({
                    id: `inline_${idx}`,
                    type: 'function',
                    function: { name: c.name, arguments: JSON.stringify(c.args) },
                  }));
                }
              }
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
            const attachTutorMeta = async (name: string, args: any) => {
              const keyId = assistantMsg.id;
              if (name === 'grade_open_response') {
                const rawId = args?.item_id;
                const itemId = (() => {
                  const s = typeof rawId === 'string' ? rawId.trim() : '';
                  if (!s || s === 'null' || s === 'undefined') return '';
                  return s;
                })();
                const feedback = String(args?.feedback || '').trim();
                const score = typeof args?.score === 'number' ? args.score : undefined;
                const criteria = Array.isArray(args?.criteria) ? args.criteria : undefined;
                if (!itemId || !feedback) return false;
                let updatedMsg: any | undefined;
                set((s) => {
                  const current = (s.ui.tutorByMessageId?.[keyId] || {}) as any;
                  const nextTutor = {
                    ...current,
                    grading: {
                      ...(current.grading || {}),
                      [itemId]: { feedback, score, criteria },
                    },
                  } as any;
                  const ui = {
                    ...s.ui,
                    tutorByMessageId: {
                      ...(s.ui.tutorByMessageId || {}),
                      [keyId]: nextTutor,
                    },
                  };
                  // Persist grading into message
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => {
                    if (m.id !== keyId) return m;
                    const prevTutor = (m as any).tutor || {};
                    const mergedTutor = {
                      ...prevTutor,
                      grading: {
                        ...(prevTutor.grading || {}),
                        [itemId]: { feedback, score, criteria },
                      },
                    } as any;
                    let hidden = '';
                    try {
                      const recap = buildTutorContextSummary(mergedTutor);
                      const json = buildTutorContextFull(mergedTutor);
                      const parts = [] as string[];
                      if (recap) parts.push(`Tutor Recap:\n${recap}`);
                      if (json) parts.push(`Tutor Data JSON:\n${json}`);
                      hidden = parts.join('\n\n');
                    } catch {}
                    // Replace hiddenContent for this assistant message
                    const nm = { ...m, tutor: mergedTutor, hiddenContent: hidden } as any;
                    updatedMsg = nm;
                    return nm;
                  });
                  return { ui, messages: { ...s.messages, [chatId]: updated } } as any;
                });
                try {
                  if (updatedMsg) await saveMessage(updatedMsg);
                } catch {}
                return true;
              }
              if (name === 'add_to_deck') {
                try {
                  const cards = Array.isArray(args?.cards) ? args.cards : [];
                  if (cards.length > 0) await addCardsToDeck(chat.id, cards);
                } catch {}
                return true;
              }
              if (name === 'srs_review') {
                // handled below when pushing tool output JSON
                return true;
              }
              return false;
            };
            for (const tc of toolCalls) {
              const name = tc?.function?.name as string;
              let args: any = {};
              try {
                const rawArgs = (tc?.function as any)?.arguments;
                if (typeof rawArgs === 'string') args = JSON.parse(rawArgs || '{}');
                else if (rawArgs && typeof rawArgs === 'object') args = rawArgs;
              } catch {}
              if (
                name !== 'web_search' &&
                name !== 'quiz_mcq' &&
                name !== 'quiz_fill_blank' &&
                name !== 'quiz_open_ended' &&
                name !== 'flashcards' &&
                name !== 'grade_open_response' &&
                name !== 'add_to_deck' &&
                name !== 'srs_review'
              )
                continue;
              if (name !== 'web_search') {
                usedTutorTool = true;
                if (
                  name === 'quiz_mcq' ||
                  name === 'quiz_fill_blank' ||
                  name === 'quiz_open_ended' ||
                  name === 'flashcards'
                ) {
                  usedTutorContentTool = true;
                }
                if (name === 'srs_review') {
                  const cnt = Math.min(
                    Math.max(parseInt(String(args?.due_count || '10'), 10) || 10, 1),
                    40,
                  );
                  let due: any[] = [];
                  try {
                    const cards = await getDueCards(chat.id, cnt);
                    due = cards.map((c) => ({
                      id: c.id,
                      front: c.front,
                      back: c.back,
                      hint: c.hint,
                      topic: c.topic,
                      skill: c.skill,
                    }));
                  } catch {}
                  const jsonPayload = JSON.stringify(due);
                  convo.push({
                    role: 'tool',
                    name,
                    tool_call_id: tc.id,
                    content: jsonPayload,
                  } as any);
                  usedTool = true;
                  continue;
                }
                const didMeta = await attachTutorMeta(name, args);
                const result = name === 'quiz_mcq' ? await attachTutorQuiz(args) : { ok: false };
                if (result.ok || didMeta) {
                  usedTool = true;
                  // Provide structured JSON tool output so the model can see the created items
                  convo.push({
                    role: 'tool',
                    name,
                    tool_call_id: tc.id,
                    content: result.json || 'ok',
                  } as any);
                }
                continue;
              }
              let rawQuery = String(args?.query || '').trim();
              const count = Math.min(
                Math.max(parseInt(String(args?.count || '5'), 10) || 5, 1),
                10,
              );
              if (!rawQuery) rawQuery = content.trim().slice(0, 256);
              if (searchProvider === 'brave')
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
                const res =
                  searchProvider === 'brave'
                    ? await fetch(`/api/brave?q=${encodeURIComponent(rawQuery)}&count=${count}`, {
                        method: 'GET',
                        headers: { Accept: 'application/json' },
                        cache: 'no-store',
                        signal: fetchController.signal,
                      } as any)
                    : undefined;
                clearTimeout(to);
                controller.signal.removeEventListener('abort', onAbort);
                if (res && res.ok) {
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
                  // Provide structured JSON tool output per OpenRouter function-calling docs
                  const jsonPayload = JSON.stringify(
                    results.slice(0, MAX_FALLBACK_RESULTS).map((r: any) => ({
                      title: r?.title,
                      url: r?.url,
                      description: r?.description,
                    })),
                  );
                  convo.push({
                    role: 'tool',
                    name: 'web_search',
                    tool_call_id: tc.id,
                    content: jsonPayload,
                  } as any);
                } else {
                  if (res && res.status === 400)
                    set((s) => ({ ui: { ...s.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
                  convo.push({
                    role: 'tool',
                    name: 'web_search',
                    tool_call_id: tc.id,
                    content: 'No results',
                  } as any);
                }
              } catch {
                if (searchProvider === 'brave')
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
            const followup =
              searchEnabled && searchProvider === 'brave'
                ? 'Write the final answer. Cite sources inline as [n].'
                : 'Continue the lesson concisely. Give brief guidance and next step. Do not repeat items already rendered.';
            convo.push({ role: 'user', content: followup } as any);
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
            usedTool && linesForSystem && searchProvider === 'brave'
              ? `\n\nWeb search results (Brave):\n${linesForSystem}\n\nInstructions: Use these results to answer and cite sources inline as [n].`
              : '';
          const finalSystem = `${baseSystem}${sourcesBlock}`;
          // Snapshot the exact system + generation settings for this assistant turn
          try {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const supportsReasoning = isReasoningSupported(modelMeta);
            const gen = {
              temperature: chat.settings.temperature,
              top_p: chat.settings.top_p,
              max_tokens: chat.settings.max_tokens,
              reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
              reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
              search_with_brave: !!chat.settings.search_with_brave,
              search_provider: searchProvider,
              tutor_mode: !!chat.settings.tutor_mode,
              providerSort,
            } as any;
            set((s) => {
              const list = s.messages[chatId] ?? [];
              const updated = list.map((m) =>
                m.id === assistantMsg.id
                  ? ({ ...m, systemSnapshot: finalSystem, genSettings: gen } as any)
                  : m,
              );
              return { messages: { ...s.messages, [chatId]: updated } } as any;
            });
          } catch {}
          // If an interactive tutor content tool was used (quiz/flashcards) and no web search occurred,
          // skip follow-up text for this assistant turn to avoid duplicating quiz in plain text.
          if (usedTutorContentTool && (!aggregatedResults || aggregatedResults.length === 0)) {
            set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
            const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
            const finalMsg = {
              ...assistantMsg,
              // Preserve any content that may have been appended when handling the tool call
              content: current?.content || '',
              reasoning: current?.reasoning,
              attachments: current?.attachments,
              // Preserve tutor payload and hidden content for model context
              tutor: (current as any)?.tutor,
              hiddenContent: (current as any)?.hiddenContent,
            } as any;
            set((s) => {
              const list = s.messages[chatId] ?? [];
              const updated = list.map((m) => (m.id === assistantMsg.id ? finalMsg : m));
              return { messages: { ...s.messages, [chatId]: updated } } as any;
            });
            await saveMessage(finalMsg);
            set((s) => ({ ...s, _controller: undefined }) as any);
            return;
          }
          const streamingMessages = (
            [{ role: 'system', content: finalSystem } as const] as any[]
          ).concat(msgs.filter((m) => m.role !== 'system'));

          const tStartPlan = performance.now();
          {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const supportsReasoning = isReasoningSupported(modelMeta);
            const supportsTools = isToolCallingSupported(modelMeta);
            // Store debug payload for this final streaming call (planning mode)
            try {
              const debugBody: any = {
                model: chat.settings.model,
                messages: streamingMessages,
                stream: true,
                stream_options: { include_usage: true },
              };
              if (isImageOutputSupported(modelMeta)) debugBody.modalities = ['image', 'text'];
              if (typeof chat.settings.temperature === 'number')
                debugBody.temperature = chat.settings.temperature;
              if (typeof chat.settings.top_p === 'number') debugBody.top_p = chat.settings.top_p;
              if (typeof chat.settings.max_tokens === 'number')
                debugBody.max_tokens = chat.settings.max_tokens;
              if (supportsReasoning) {
                const rc: any = {};
                if (typeof chat.settings.reasoning_effort === 'string')
                  rc.effort = chat.settings.reasoning_effort;
                if (typeof chat.settings.reasoning_tokens === 'number')
                  rc.max_tokens = chat.settings.reasoning_tokens;
                if (Object.keys(rc).length > 0) debugBody.reasoning = rc;
              }
              if (supportsTools) {
                debugBody.tools = toolDefinition as any;
                debugBody.tool_choice = 'none';
              }
              if (providerSort === 'price' || providerSort === 'throughput') {
                debugBody.provider = { sort: providerSort };
              }
              // For standard mode, include PDF parser and OpenRouter web plugin when selected
              const combinedPluginsStd = (() => {
                const arr: any[] = [];
                if (Array.isArray(plugins) && plugins.length > 0) arr.push(...plugins);
                if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
                return arr;
              })();
              if (combinedPluginsStd.length > 0) debugBody.plugins = combinedPluginsStd;
              if (get().ui.debugMode) {
                set((s) => ({
                  ui: {
                    ...s.ui,
                    debugByMessageId: {
                      ...(s.ui.debugByMessageId || {}),
                      [assistantMsg.id]: {
                        body: JSON.stringify(debugBody, null, 2),
                        createdAt: Date.now(),
                      },
                    },
                  },
                }));
              }
            } catch {}
            const requestedEffort = supportsReasoning ? chat.settings.reasoning_effort : undefined;
            const requestedTokensRaw = supportsReasoning
              ? chat.settings.reasoning_tokens
              : undefined;
            const effortRequested =
              typeof requestedEffort === 'string' && requestedEffort !== 'none';
            const tokensRequested =
              typeof requestedTokensRaw === 'number' && requestedTokensRaw > 0;
            const autoReasoningEligible = !effortRequested && !tokensRequested;
            const modelIdUsed = chat.settings.model;
            const planCallbacks = createMessageStreamCallbacks(
              {
                chatId,
                assistantMessage: assistantMsg,
                set,
                get,
                startBuffered: false,
                autoReasoningEligible,
                modelIdUsed,
                clearController: () => set((s) => ({ ...s, _controller: undefined }) as any),
                persistMessage: saveMessage,
              },
              { startedAt: tStartPlan },
            );
            await streamChatCompletion({
              apiKey: key || '',
              model: chat.settings.model,
              messages: streamingMessages,
              modalities: isImageOutputSupported(modelMeta)
                ? (['image', 'text'] as any)
                : undefined,
              temperature: chat.settings.temperature,
              top_p: chat.settings.top_p,
              max_tokens: chat.settings.max_tokens,
              reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
              reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
              signal: controller.signal,
              // Include tool schema for validation on follow-up call; disable further tool use
              tools: supportsTools ? (toolDefinition as any) : undefined,
              tool_choice: supportsTools ? ('none' as any) : undefined,
              providerSort,
              plugins: (() => {
                const arr: any[] = [];
                if (Array.isArray(plugins) && plugins.length > 0) arr.push(...plugins);
                if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
                return arr.length > 0 ? arr : undefined;
              })(),
              callbacks: planCallbacks,
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
        // No automatic fallback web search; the model will call the tool when necessary
        const streamingMessages = msgs;
        {
          const modelMeta = findModelById(get().models, chat.settings.model);
          const supportsReasoning = isReasoningSupported(modelMeta);
          // Store debug payload for this streaming call (standard mode)
          try {
            const debugBody: any = {
              model: chat.settings.model,
              messages: streamingMessages,
              stream: true,
              stream_options: { include_usage: true },
            };
            if (isImageOutputSupported(modelMeta)) debugBody.modalities = ['image', 'text'];
            if (typeof chat.settings.temperature === 'number')
              debugBody.temperature = chat.settings.temperature;
            if (typeof chat.settings.top_p === 'number') debugBody.top_p = chat.settings.top_p;
            if (typeof chat.settings.max_tokens === 'number')
              debugBody.max_tokens = chat.settings.max_tokens;
            if (supportsReasoning) {
              const rc: any = {};
              if (typeof chat.settings.reasoning_effort === 'string')
                rc.effort = chat.settings.reasoning_effort;
              if (typeof chat.settings.reasoning_tokens === 'number')
                rc.max_tokens = chat.settings.reasoning_tokens;
              if (Object.keys(rc).length > 0) debugBody.reasoning = rc;
            }
            if (providerSort === 'price' || providerSort === 'throughput') {
              debugBody.provider = { sort: providerSort };
            }
            const combinedPluginsStd = (() => {
              const arr: any[] = [];
              if (Array.isArray(plugins) && plugins.length > 0) arr.push(...plugins);
              if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
              return arr;
            })();
            if (combinedPluginsStd.length > 0) debugBody.plugins = combinedPluginsStd;
            if (get().ui.debugMode) {
              set((s) => ({
                ui: {
                  ...s.ui,
                  debugByMessageId: {
                    ...(s.ui.debugByMessageId || {}),
                    [assistantMsg.id]: {
                      body: JSON.stringify(debugBody, null, 2),
                      createdAt: Date.now(),
                    },
                  },
                },
              }));
            }
          } catch {}
          const requestedEffort = supportsReasoning ? chat.settings.reasoning_effort : undefined;
          const requestedTokensRaw = supportsReasoning ? chat.settings.reasoning_tokens : undefined;
          const effortRequested = typeof requestedEffort === 'string' && requestedEffort !== 'none';
          const tokensRequested = typeof requestedTokensRaw === 'number' && requestedTokensRaw > 0;
          const autoReasoningEligible = !effortRequested && !tokensRequested;
          const modelIdUsed = chat.settings.model;
          const streamCallbacks = createMessageStreamCallbacks(
            {
              chatId,
              assistantMessage: assistantMsg,
              set,
              get,
              startBuffered: attemptPlanning,
              autoReasoningEligible,
              modelIdUsed,
              clearController: () => set((s) => ({ ...s, _controller: undefined }) as any),
              persistMessage: saveMessage,
            },
            { startedAt: tStart },
          );
          await streamChatCompletion({
            apiKey: key || '',
            model: chat.settings.model,
            messages: streamingMessages,
            modalities: isImageOutputSupported(modelMeta) ? (['image', 'text'] as any) : undefined,
            temperature: chat.settings.temperature,
            top_p: chat.settings.top_p,
            max_tokens: chat.settings.max_tokens,
            reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
            reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
            signal: controller.signal,
            providerSort,
            plugins: (() => {
              const arr: any[] = [];
              if (Array.isArray(plugins) && plugins.length > 0) arr.push(...plugins);
              if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
              return arr.length > 0 ? arr : undefined;
            })(),
            callbacks: streamCallbacks,
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
      const useProxy = isOpenRouterProxyEnabled();
      const key = getPublicOpenRouterKey();
      if (!key && !useProxy)
        return set((s) => ({
          ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
        }));
      const chatId = get().selectedChatId!;
      let chat = get().chats.find((c) => c.id === chatId)!;
      const uiState = get().ui;
      const tutorGloballyEnabled = !!uiState.experimentalTutor;
      const forceTutorMode = !!(uiState.forceTutorMode ?? false);
      const tutorEnabled = tutorGloballyEnabled && (forceTutorMode || !!chat.settings.tutor_mode);
      if (tutorEnabled) {
        const desiredModel =
          uiState.tutorDefaultModelId ||
          chat.settings.tutor_default_model ||
          DEFAULT_TUTOR_MODEL_ID;
        opts = { ...(opts || {}), modelId: desiredModel };
        if (
          chat.settings.model !== desiredModel ||
          chat.settings.tutor_default_model !== desiredModel
        ) {
          const updatedSettings = {
            ...chat.settings,
            model: desiredModel,
            tutor_default_model: desiredModel,
          };
          const updatedChat = { ...chat, settings: updatedSettings, updatedAt: Date.now() };
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
          chat = updatedChat;
          try {
            await saveChat(updatedChat);
          } catch {}
        }
      }
      if (get().ui.zdrOnly === true) {
        const nextModel = opts?.modelId || chat.settings.model;
        const allowed = await ensureZdrAllowed(nextModel);
        if (!allowed) return;
      }
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const payloadBefore = buildChatCompletionMessages({
        chat,
        priorMessages: list.slice(0, idx),
        models: get().models,
      });
      // Prefer the exact system snapshot captured when the original assistant message was generated
      // so regen reproduces the same context regardless of current chat settings.
      const original = list[idx] as any;
      const systemSnapshot: string | undefined = original?.systemSnapshot;
      const genSnapshot: any = original?.genSettings || {};
      const msgs = systemSnapshot
        ? ([{ role: 'system', content: systemSnapshot } as const] as any[]).concat(
            payloadBefore.filter((m: any) => m.role !== 'system'),
          )
        : payloadBefore;
      // Detect PDFs anywhere prior to this assistant message to enable parser plugin
      const hadPdfEarlier = list
        .slice(0, idx)
        .some(
          (m) => Array.isArray(m.attachments) && m.attachments.some((a: any) => a?.kind === 'pdf'),
        );
      const replacement: Message = {
        id: messageId,
        chatId,
        role: 'assistant',
        content: '',
        createdAt: list[idx].createdAt,
        model: opts?.modelId || chat.settings.model,
        reasoning: '',
        attachments: [],
        systemSnapshot: (original as any)?.systemSnapshot,
        genSettings: (original as any)?.genSettings,
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: list.map((m) => (m.id === messageId ? replacement : m)),
        },
        ui: { ...s.ui, isStreaming: true },
      }));
      try {
        const controller = new AbortController();
        set((s) => ({ ...s, _controller: controller as any }) as any);
        const tStart = performance.now();
        {
          const modelMeta = findModelById(get().models, replacement.model!);
          const supportsReasoning = isReasoningSupported(modelMeta);
          const previousModelId =
            typeof (original as any)?.model === 'string' ? (original as any).model : undefined;
          const modelChanged =
            typeof replacement.model === 'string' && replacement.model !== previousModelId;
          const pickNumber = (snapshotVal: unknown, chatVal: unknown) => {
            if (modelChanged) {
              if (typeof chatVal === 'number') return chatVal;
              if (typeof snapshotVal === 'number') return snapshotVal;
            } else {
              if (typeof snapshotVal === 'number') return snapshotVal;
              if (typeof chatVal === 'number') return chatVal;
            }
            return undefined;
          };
          const pickReasoningEffort = (
            snapshotVal: unknown,
            chatVal: unknown,
          ): 'none' | 'low' | 'medium' | 'high' | undefined => {
            if (!supportsReasoning) return undefined;
            if (modelChanged) {
              if (typeof chatVal === 'string') return chatVal as any;
              if (typeof snapshotVal === 'string') return snapshotVal as any;
            } else {
              if (typeof snapshotVal === 'string') return snapshotVal as any;
              if (typeof chatVal === 'string') return chatVal as any;
            }
            return undefined;
          };
          const pickReasoningTokens = (snapshotVal: unknown, chatVal: unknown) => {
            if (!supportsReasoning) return undefined;
            if (modelChanged) {
              if (typeof chatVal === 'number') return chatVal;
              if (typeof snapshotVal === 'number') return snapshotVal;
            } else {
              if (typeof snapshotVal === 'number') return snapshotVal;
              if (typeof chatVal === 'number') return chatVal;
            }
            return undefined;
          };
          const pickBoolean = (snapshotVal: unknown, chatVal: unknown, fallback = false) => {
            if (modelChanged) {
              if (typeof chatVal === 'boolean') return chatVal;
              if (typeof snapshotVal === 'boolean') return snapshotVal;
            } else {
              if (typeof snapshotVal === 'boolean') return snapshotVal;
              if (typeof chatVal === 'boolean') return chatVal;
            }
            return fallback;
          };
          const pickProvider = (
            snapshotVal: unknown,
            chatVal: unknown,
          ): 'brave' | 'openrouter' | undefined => {
            if (modelChanged) {
              if (typeof chatVal === 'string') return chatVal as any;
              if (typeof snapshotVal === 'string') return snapshotVal as any;
            } else {
              if (typeof snapshotVal === 'string') return snapshotVal as any;
              if (typeof chatVal === 'string') return chatVal as any;
            }
            return undefined;
          };
          const tempUsed = pickNumber(genSnapshot.temperature, chat.settings.temperature);
          const topPUsed = pickNumber(genSnapshot.top_p, chat.settings.top_p);
          const maxTokUsed = pickNumber(genSnapshot.max_tokens, chat.settings.max_tokens);
          const rEffortUsed = pickReasoningEffort(
            genSnapshot.reasoning_effort,
            chat.settings.reasoning_effort,
          );
          const rTokUsed = pickReasoningTokens(
            genSnapshot.reasoning_tokens,
            chat.settings.reasoning_tokens,
          );
          const searchWithBrave = pickBoolean(
            genSnapshot?.search_with_brave,
            (chat.settings as any)?.search_with_brave,
            false,
          );
          const providerForTurn = pickProvider(
            genSnapshot?.search_provider,
            (chat.settings as any)?.search_provider,
          );
          const tutorModeForTurn = pickBoolean(
            genSnapshot?.tutor_mode,
            chat.settings.tutor_mode,
            false,
          );
          const appliedGenSettings: Record<string, any> = {};
          if (typeof tempUsed === 'number') appliedGenSettings.temperature = tempUsed;
          if (typeof topPUsed === 'number') appliedGenSettings.top_p = topPUsed;
          if (typeof maxTokUsed === 'number') appliedGenSettings.max_tokens = maxTokUsed;
          if (supportsReasoning && typeof rEffortUsed === 'string')
            appliedGenSettings.reasoning_effort = rEffortUsed;
          if (supportsReasoning && typeof rTokUsed === 'number')
            appliedGenSettings.reasoning_tokens = rTokUsed;
          appliedGenSettings.search_with_brave = !!searchWithBrave;
          if (providerForTurn) appliedGenSettings.search_provider = providerForTurn;
          appliedGenSettings.tutor_mode = !!tutorModeForTurn;
          if (genSnapshot?.providerSort === 'price' || genSnapshot?.providerSort === 'throughput')
            appliedGenSettings.providerSort = genSnapshot.providerSort;
          set((s) => {
            const list2 = s.messages[chatId] ?? [];
            const updated = list2.map((m) =>
              m.id === replacement.id ? ({ ...m, genSettings: appliedGenSettings } as any) : m,
            );
            return { messages: { ...s.messages, [chatId]: updated } } as any;
          });
          // Store debug payload for regenerate streaming call (using snapshot where available)
          try {
            const debugBody: any = {
              model: replacement.model!,
              messages: msgs,
              stream: true,
              stream_options: { include_usage: true },
            };
            if (hadPdfEarlier)
              debugBody.plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
            if (searchWithBrave && providerForTurn === 'openrouter') {
              debugBody.plugins = [...(debugBody.plugins || []), { id: 'web' }];
            }
            if (isImageOutputSupported(modelMeta)) debugBody.modalities = ['image', 'text'];
            if (typeof tempUsed === 'number') debugBody.temperature = tempUsed;
            if (typeof topPUsed === 'number') debugBody.top_p = topPUsed;
            if (typeof maxTokUsed === 'number') debugBody.max_tokens = maxTokUsed;
            if (supportsReasoning) {
              const rc: any = {};
              if (typeof rEffortUsed === 'string') rc.effort = rEffortUsed;
              if (typeof rTokUsed === 'number') rc.max_tokens = rTokUsed;
              if (Object.keys(rc).length > 0) debugBody.reasoning = rc;
            }
            if (
              genSnapshot?.providerSort === 'price' ||
              genSnapshot?.providerSort === 'throughput'
            ) {
              debugBody.provider = { sort: genSnapshot.providerSort };
            }
            if (get().ui.debugMode) {
              set((s) => ({
                ui: {
                  ...s.ui,
                  debugByMessageId: {
                    ...(s.ui.debugByMessageId || {}),
                    [replacement.id]: {
                      body: JSON.stringify(debugBody, null, 2),
                      createdAt: Date.now(),
                    },
                  },
                },
              }));
            }
          } catch {}
          const effortRequested = typeof rEffortUsed === 'string' && rEffortUsed !== 'none';
          const tokensRequested = typeof rTokUsed === 'number' && rTokUsed > 0;
          const autoReasoningEligible = !effortRequested && !tokensRequested;
          const modelIdUsed = replacement.model!;
          const regenCallbacks = createMessageStreamCallbacks(
            {
              chatId,
              assistantMessage: replacement,
              set,
              get,
              startBuffered: false,
              autoReasoningEligible,
              modelIdUsed,
              clearController: () => set((s) => ({ ...s, _controller: undefined }) as any),
              persistMessage: saveMessage,
            },
            { startedAt: tStart },
          );
          await streamChatCompletion({
            apiKey: key || '',
            model: replacement.model!,
            messages: msgs,
            modalities: isImageOutputSupported(modelMeta) ? (['image', 'text'] as any) : undefined,
            temperature: tempUsed,
            top_p: topPUsed,
            max_tokens: maxTokUsed,
            reasoning_effort: rEffortUsed,
            reasoning_tokens: rTokUsed,
            signal: controller.signal,
            providerSort: genSnapshot?.providerSort,
            plugins: (() => {
              const arr: any[] = [];
              if (hadPdfEarlier) arr.push({ id: 'file-parser', pdf: { engine: 'pdf-text' } });
              if (searchWithBrave && providerForTurn === 'openrouter') arr.push({ id: 'web' });
              return arr.length > 0 ? arr : undefined;
            })(),
            callbacks: regenCallbacks,
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
