import { v4 as uuidv4 } from 'uuid';
import type { StoreState } from '@/lib/store/types';
import type { Message, TutorEvent, TutorProfile } from '@/lib/types';
import { updateTutorProfile, loadTutorProfile } from '@/lib/tutorProfile';
import { saveMessage } from '@/lib/db';
import {
  buildTutorWelcomeFallback,
  generateTutorWelcomeMessage,
  normalizeTutorMemory,
} from '@/lib/agent/tutorMemory';
import { DEFAULT_TUTOR_MODEL_ID, DEFAULT_TUTOR_MEMORY_MODEL_ID } from '@/lib/constants';
import { getPublicOpenRouterKey, isOpenRouterProxyEnabled } from '@/lib/config';

export function createTutorSlice(
  set: (updater: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  const canUseProxy = typeof window !== 'undefined' && isOpenRouterProxyEnabled();

  const buildWelcome = async (params: {
    memory?: string;
    modelId: string;
    apiKey?: string;
    signal?: AbortSignal;
  }): Promise<{ message: string; error?: string; isFallback: boolean }> => {
    const { memory, modelId, apiKey, signal } = params;
    const normalizedMemory = normalizeTutorMemory(memory);
    const hasCredentials = (apiKey && apiKey.trim()) || canUseProxy;
    if (!hasCredentials)
      return {
        message: buildTutorWelcomeFallback(normalizedMemory),
        error: 'tutor_welcome_no_credentials',
        isFallback: true,
      };
    const text = await generateTutorWelcomeMessage({
      apiKey: apiKey || '',
      model: modelId,
      memory: normalizedMemory,
      signal,
    });
    return { message: text, error: undefined, isFallback: false };
  };

  return {
    async logTutorResult(evt: TutorEvent) {
      const chatId = get().selectedChatId!;
      if (!chatId) return;
      const prof = await updateTutorProfile(chatId, evt);
      set((s) => ({
        ui: {
          ...s.ui,
          tutorProfileByChatId: { ...(s.ui.tutorProfileByChatId || {}), [chatId]: prof },
        },
      }));
    },
    async loadTutorProfileIntoUI(chatId?: string) {
      const id = chatId || get().selectedChatId!;
      if (!id) return;
      const prof = await loadTutorProfile(id);
      if (prof)
        set((s) => ({
          ui: {
            ...s.ui,
            tutorProfileByChatId: { ...(s.ui.tutorProfileByChatId || {}), [id]: prof },
          },
        }));
    },
    async primeTutorWelcomePreview() {
      const state = get();
      const tutorActive =
        !!state.ui.experimentalTutor && (state.ui.forceTutorMode || state.ui.nextTutorMode);
      if (!tutorActive) {
        set((s) => ({
          ui: {
            ...s.ui,
            tutorWelcomePreview: { status: 'idle' },
          },
        }));
        return undefined;
      }
      const current = state.ui.tutorWelcomePreview;
      if (current?.status === 'loading') return current.message;

      set((s) => ({
        ui: {
          ...s.ui,
          tutorWelcomePreview: { status: 'loading' },
        },
      }));

      const apiKey = getPublicOpenRouterKey();
      const modelId =
        state.ui.tutorMemoryModelId ||
        state.ui.tutorDefaultModelId ||
        state.ui.nextModel ||
        DEFAULT_TUTOR_MEMORY_MODEL_ID;
      set((s) => ({
        ui: {
          ...s.ui,
          tutorWelcomePreview: {
            status: 'loading',
            generatedAt: Date.now(),
            message: buildTutorWelcomeFallback(state.ui.tutorGlobalMemory),
          },
        },
      }));
      try {
        const { message, error } = await buildWelcome({
          memory: state.ui.tutorGlobalMemory,
          modelId,
          apiKey,
        });
        set((s) => ({
          ui: {
            ...s.ui,
            tutorWelcomePreview: {
              status: 'ready',
              message,
              error,
              generatedAt: Date.now(),
            },
          },
        }));
        return message;
      } catch (err: any) {
        set((s) => ({
          ui: {
            ...s.ui,
            tutorWelcomePreview: {
              status: 'ready',
              message: buildTutorWelcomeFallback(state.ui.tutorGlobalMemory),
              error: String(err?.message || err) || 'welcome_failed',
              generatedAt: Date.now(),
            },
          },
        }));
        return buildTutorWelcomeFallback(state.ui.tutorGlobalMemory);
      }
    },
    async prepareTutorWelcomeMessage(chatId?: string) {
      const id = chatId || get().selectedChatId;
      if (!id) return undefined;
      const state = get();
      const chat = state.chats.find((c) => c.id === id);
      if (!chat || !chat.settings?.tutor_mode) {
        set((s) => ({
          ui: {
            ...s.ui,
            tutorWelcomeByChatId: {
              ...(s.ui.tutorWelcomeByChatId || {}),
              [id]: { status: 'error', error: 'tutor_disabled' },
            },
          },
        }));
        return undefined;
      }

      const current = state.ui.tutorWelcomeByChatId?.[id];
      if (current?.status === 'loading') return current.message;

      const currentMessages = state.messages[id] ?? [];
      const apiKey = getPublicOpenRouterKey();
      const modelId =
        chat.settings.tutor_memory_model ||
        chat.settings.tutor_default_model ||
        chat.settings.model ||
        DEFAULT_TUTOR_MODEL_ID;

      const fallbackText = buildTutorWelcomeFallback(chat.settings.tutor_memory).trim();
      const previewState = state.ui.tutorWelcomePreview;
      const previewContent =
        previewState?.status === 'ready' && previewState.message
          ? previewState.message.trim()
          : undefined;
      const findWelcomeIndex = (list: Message[]) => {
        const flaggedIdx = list.findIndex((m) => m.role === 'assistant' && m.tutorWelcome);
        if (flaggedIdx >= 0) return flaggedIdx;
        const firstUserIdx = list.findIndex((m) => m.role === 'user');
        const searchLimit = firstUserIdx >= 0 ? firstUserIdx : list.length;
        for (let i = 0; i < searchLimit; i += 1) {
          if (list[i]?.role === 'assistant') return i;
        }
        return -1;
      };

      const existingWelcomeIdx = findWelcomeIndex(currentMessages);
      const existingWelcome =
        existingWelcomeIdx >= 0 ? currentMessages[existingWelcomeIdx] : undefined;
      const existingContent = existingWelcome?.content?.trim();
      const cachedWelcomeState = state.ui.tutorWelcomeByChatId?.[id];
      const cachedContent =
        cachedWelcomeState?.status === 'ready' && cachedWelcomeState.message
          ? cachedWelcomeState.message.trim()
          : undefined;
      const hasCredentials = !!((apiKey && apiKey.trim()) || canUseProxy);

      const pickInitialMessage = () => {
        const candidates = [existingContent, previewContent, cachedContent].filter(
          (value): value is string => !!value && value.trim().length > 0,
        );
        const nonFallback = candidates.find((value) => value !== fallbackText);
        return nonFallback || fallbackText;
      };

      const initialMessage = pickInitialMessage();

      const resolveInsertionTimestamp = (list: Message[]) => {
        const welcomeIndex = findWelcomeIndex(list);
        if (welcomeIndex >= 0) return list[welcomeIndex].createdAt;
        const firstUser = list.find((m) => m.role === 'user');
        if (firstUser) return firstUser.createdAt - 1;
        const firstAssistant = list.find((m) => m.role === 'assistant');
        if (firstAssistant) return firstAssistant.createdAt - 1;
        return Date.now() - 1;
      };

      const upsertWelcomeMessage = (
        content: string,
        status: 'idle' | 'loading' | 'ready' | 'error' = 'ready',
        errorMessage?: string,
        generatedAt?: number,
      ) => {
        const trimmed = content.trim();
        let welcomeMessage: Message | undefined;
        set((s) => {
          const list = s.messages[id] ?? currentMessages;
          const welcomeIndex = findWelcomeIndex(list);
          const existing = welcomeIndex >= 0 ? list[welcomeIndex] : undefined;
          const createdAt = generatedAt ?? existing?.createdAt ?? resolveInsertionTimestamp(list);
          welcomeMessage = existing
            ? { ...existing, content: trimmed, model: modelId, tutorWelcome: true }
            : {
                id: uuidv4(),
                chatId: id,
                role: 'assistant',
                content: trimmed,
                createdAt,
                model: modelId,
                reasoning: '',
                tutorWelcome: true,
              };
          const nextMessages = (() => {
            if (welcomeIndex >= 0)
              return list.map((m, idx) => (idx === welcomeIndex ? welcomeMessage! : m));
            const insertIdx = (() => {
              const firstUserIdx = list.findIndex((m) => m.role === 'user');
              if (firstUserIdx >= 0) return firstUserIdx;
              const firstAssistantIdx = list.findIndex((m) => m.role === 'assistant');
              if (firstAssistantIdx >= 0) return firstAssistantIdx;
              return list.length;
            })();
            const next = [...list];
            next.splice(insertIdx, 0, welcomeMessage!);
            return next;
          })();
          return {
            messages: {
              ...s.messages,
              [id]: nextMessages,
            },
            ui: {
              ...s.ui,
              tutorWelcomeByChatId: {
                ...(s.ui.tutorWelcomeByChatId || {}),
                [id]: {
                  status,
                  message: trimmed,
                  error: errorMessage,
                  generatedAt: generatedAt ?? createdAt,
                },
              },
              tutorGreetedByChatId: { ...(s.ui.tutorGreetedByChatId || {}), [id]: true },
            },
          };
        });
        return welcomeMessage!;
      };

      const initialWelcome = upsertWelcomeMessage(
        initialMessage,
        'ready',
        cachedWelcomeState?.error,
        cachedWelcomeState?.generatedAt,
      );
      const initialWasUpdated =
        !existingWelcome || existingWelcome.content.trim() !== initialWelcome.content.trim();
      if (initialWasUpdated) {
        try {
          await saveMessage(initialWelcome);
        } catch {}
      }

      const shouldGenerate = hasCredentials && initialMessage === fallbackText;
      if (!shouldGenerate) return initialMessage;

      let finalMessage = fallbackText;
      let error: string | undefined;
      try {
        const build = await buildWelcome({
          memory: chat.settings.tutor_memory,
          modelId,
          apiKey,
        });
        finalMessage = build.message.trim() || fallbackText;
        error = build.error;
      } catch (err: any) {
        error = String(err?.message || err) || 'welcome_failed';
      }

      const finalWelcome = upsertWelcomeMessage(finalMessage, 'ready', error, Date.now());
      const finalChanged = finalWelcome.content.trim() !== initialWelcome.content.trim();
      if (finalChanged) {
        try {
          await saveMessage(finalWelcome);
        } catch {}
      }
      return finalMessage;
    },
  } satisfies Partial<StoreState>;
}
