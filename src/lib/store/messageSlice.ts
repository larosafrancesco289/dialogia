import { v4 as uuidv4 } from 'uuid';
import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { saveMessage, saveChat } from '@/lib/db';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { streamChatCompletion, chatCompletion } from '@/lib/openrouter';
import { getTutorPreamble, getTutorToolDefinitions } from '@/lib/agent/tutor';
import {
  attachTutorUiState,
  buildHiddenTutorContent,
  ensureTutorDefaults,
  maybeAdvanceTutorMemory,
} from '@/lib/agent/tutorFlow';
import { snapshotGenSettings } from '@/lib/agent/generation';
import {
  updateTutorMemory,
  normalizeTutorMemory,
  getTutorMemoryFrequency,
  EMPTY_TUTOR_MEMORY,
} from '@/lib/agent/tutorMemory';
import { runDeepResearchTurn } from '@/lib/agent/deepResearchOrchestrator';
import { loadTutorProfile, summarizeTutorProfile } from '@/lib/tutorProfile';
import {
  isReasoningSupported,
  findModelById,
  isToolCallingSupported,
  isImageOutputSupported,
} from '@/lib/models';
import { DEFAULT_TUTOR_MODEL_ID, DEFAULT_TUTOR_MEMORY_MODEL_ID } from '@/lib/constants';
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
import { providerSortFromRoutePref, composePlugins, buildDebugBody } from '@/lib/agent/request';
import { planTurn, streamFinal } from '@/lib/services/messagePipeline';
import { getSearchToolDefinition } from '@/lib/agent/searchFlow';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
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
          const hidden = buildHiddenTutorContent(uiTutor as any);
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
        const ensured = ensureTutorDefaults({
          ui: uiState,
          chat,
          fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
          fallbackMemoryModelId: DEFAULT_TUTOR_MEMORY_MODEL_ID,
        });
        if (ensured.changed) {
          const updatedChat = { ...chat, settings: ensured.nextSettings, updatedAt: Date.now() };
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
      if (tutorEnabled) {
        const result = await maybeAdvanceTutorMemory({
          apiKey: key || '',
          modelId: tutorMemoryModelId,
          settings: chat.settings,
          conversation: priorList.concat(userMsg),
          autoUpdate: memoryAutoUpdateEnabled,
        });
        const updatedChat = { ...chat, settings: result.nextSettings, updatedAt: Date.now() };
        if (JSON.stringify(updatedChat.settings) !== JSON.stringify(chat.settings)) {
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
          chat = updatedChat;
          try {
            await saveChat(updatedChat);
          } catch {}
        }
        memoryDebug = result.debug;
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
      const plugins = composePlugins({
        hasPdf,
        searchEnabled: false,
        searchProvider: 'openrouter',
      });
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
      const providerSort = providerSortFromRoutePref(get().ui.routePreference as any);
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
            searchEnabled && searchProvider === 'brave' ? getSearchToolDefinition() : [];
          const toolDefinition = [...baseTools, ...tutorTools];
          const planResult = await planTurn({
            chat,
            chatId,
            assistantMessage: assistantMsg,
            userContent: content,
            combinedSystem: combinedSystemForThisTurn,
            baseMessages: msgs,
            toolDefinition,
            searchEnabled,
            searchProvider,
            providerSort,
            apiKey: key || '',
            controller,
            set,
            get,
            models: get().models,
            persistMessage: saveMessage,
          });
          try {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const gen = snapshotGenSettings({
              settings: chat.settings,
              modelMeta,
              searchProvider,
              providerSort,
            });
            set((s) => {
              const list = s.messages[chatId] ?? [];
              const updated = list.map((m) =>
                m.id === assistantMsg.id
                  ? ({ ...m, systemSnapshot: planResult.finalSystem, genSettings: gen } as any)
                  : m,
              );
              return { messages: { ...s.messages, [chatId]: updated } } as any;
            });
          } catch {}
          if (planResult.usedTutorContentTool && !planResult.hasSearchResults) {
            set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
            const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
            const finalMsg = {
              ...assistantMsg,
              content: current?.content || '',
              reasoning: current?.reasoning,
              attachments: current?.attachments,
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
            [{ role: 'system', content: planResult.finalSystem } as const] as any[]
          ).concat(msgs.filter((m) => m.role !== 'system'));
          await streamFinal({
            chat,
            chatId,
            assistantMessage: assistantMsg,
            messages: streamingMessages,
            controller,
            apiKey: key || '',
            providerSort,
            set,
            get,
            models: get().models,
            persistMessage: saveMessage,
            basePlugins: plugins,
            searchEnabled,
            searchProvider,
            toolDefinition,
            startBuffered: false,
          });
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
        await streamFinal({
          chat,
          chatId,
          assistantMessage: assistantMsg,
          messages: msgs,
          controller,
          apiKey: key || '',
          providerSort,
          set,
          get,
          models: get().models,
          persistMessage: saveMessage,
          basePlugins: plugins,
          searchEnabled,
          searchProvider,
          startBuffered: attemptPlanning,
        });
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
            const dbg = buildDebugBody({
              modelId: replacement.model!,
              messages: msgs as any,
              stream: true,
              includeUsage: true,
              canImageOut: isImageOutputSupported(modelMeta),
              temperature: tempUsed,
              top_p: topPUsed,
              max_tokens: maxTokUsed,
              reasoningEffort: supportsReasoning ? rEffortUsed : undefined,
              reasoningTokens: supportsReasoning ? rTokUsed : undefined,
              providerSort: genSnapshot?.providerSort,
              plugins: composePlugins({
                hasPdf: hadPdfEarlier,
                searchEnabled: searchWithBrave,
                searchProvider: providerForTurn,
              }),
            });
            if (get().ui.debugMode) {
              set((s) => ({
                ui: {
                  ...s.ui,
                  debugByMessageId: {
                    ...(s.ui.debugByMessageId || {}),
                    [replacement.id]: {
                      body: JSON.stringify(dbg, null, 2),
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
