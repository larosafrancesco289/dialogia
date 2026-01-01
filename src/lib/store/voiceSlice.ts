// Module: store/voiceSlice
// Responsibility: Zustand slice for xAI voice agent state management

import { createStoreSlice } from '@/lib/store/createSlice';
import { buildDefaultVoiceState } from '@/lib/voice/types';
import type { VoiceConfig } from '@/lib/voice/types';
import type { StoreState } from '@/lib/store/types';
import { repository } from '@/lib/db';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { appendMessagesToChat } from '@/lib/messages/indexing';

export const createVoiceSlice = createStoreSlice((set, get) => {
  const initialVoice = buildDefaultVoiceState();
  const persistMessage = createMessagePersister(repository);

  return {
    voice: initialVoice,

    setVoiceActive: (active: boolean) => {
      set((s) => ({
        voice: {
          ...s.voice,
          isActive: active,
        },
      }));
    },

    setVoiceConnected: (connected: boolean) => {
      set((s) => ({
        voice: {
          ...s.voice,
          isConnected: connected,
        },
      }));
    },

    setVoiceListening: (listening: boolean) => {
      set((s) => ({
        voice: {
          ...s.voice,
          isListening: listening,
        },
      }));
    },

    setVoiceSpeaking: (speaking: boolean) => {
      set((s) => ({
        voice: {
          ...s.voice,
          isSpeaking: speaking,
        },
      }));
    },

    setVoiceError: (error: string | null) => {
      set((s) => ({
        voice: {
          ...s.voice,
          error,
        },
      }));
    },

    setVoiceConfig: (config: Partial<VoiceConfig>) => {
      set((s) => ({
        voice: {
          ...s.voice,
          config: {
            ...s.voice.config,
            ...config,
          },
        },
      }));
    },

    resetVoiceState: () => {
      set((s) => ({
        voice: {
          ...buildDefaultVoiceState(),
          config: s.voice.config, // Preserve config
        },
      }));
    },

    // Ensure there's a chat for voice messages
    async ensureChatForVoice(): Promise<string> {
      const state = get();
      if (state.selectedChatId) {
        return state.selectedChatId;
      }

      // Use the existing newChat action
      await state.newChat();
      return get().selectedChatId!;
    },

    // Add a voice user message without triggering LLM
    async addVoiceUserMessage(content: string): Promise<void> {
      const chatId = await get().ensureChatForVoice();

      const message = createUserMessage({
        chatId,
        content,
        metadata: { source: 'voice' },
      });

      set((s) => ({
        ...appendMessagesToChat(s, chatId, [message]),
      }));

      await persistMessage(message);
    },

    // Add a voice assistant message without triggering anything
    async addVoiceAssistantMessage(content: string): Promise<void> {
      const chatId = await get().ensureChatForVoice();

      const message = createAssistantMessage({
        chatId,
        content,
        model: 'xai-voice',
        metadata: { source: 'voice' },
      });

      set((s) => ({
        ...appendMessagesToChat(s, chatId, [message]),
      }));

      await persistMessage(message);
    },
  } satisfies Partial<StoreState>;
});
