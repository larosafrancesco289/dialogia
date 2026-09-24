import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import type { UIDebugState, UISearchState } from '@/lib/store/types';
import { selectIsTutorEnabledForChat } from '@/lib/store/selectors';
import { resolveDisplayPreferences } from '@/lib/settings/chatDefaults';
const EMPTY_AUTO_REASONING: Record<string, boolean> = {};

export type MessageCardViewModel = {
  message?: Message;
  chat?: Chat;
  models: ModelDescriptor[];
  tavilyEntry?: NonNullable<UISearchState['tavilyByMessageId']>[string];
  debugMode: boolean;
  debugEntry?: NonNullable<UIDebugState['byMessageId']>[string];
  autoReasoningModelIds: Record<string, boolean>;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
  showStats: boolean;
  tutorEnabled: boolean;
  /** Explicitly tracked for reactivity - changes trigger re-render */
  toolCallsLength: number;
};

export function useMessageCardViewModel({
  chatId,
  messageId,
}: {
  chatId: string;
  messageId: string;
}): MessageCardViewModel {
  const selection = useChatStore((state) => {
    const message =
      state.messagesById[messageId]?.chatId === chatId ? state.messagesById[messageId] : undefined;
    const chat = state.chats.find((entry) => entry.id === chatId);
    const tutorEnabled = selectIsTutorEnabledForChat(chatId)(state);
    const display = resolveDisplayPreferences(state.ui.chatDefaults);

    return {
      message,
      chat,
      models: state.models,
      tavilyEntry: state.ui.search.tavilyByMessageId?.[messageId],
      debugMode: !!state.ui.debug.mode,
      debugEntry: state.ui.debug.byMessageId?.[messageId],
      autoReasoningModelIds: state.ui.debug.autoReasoningModelIds ?? EMPTY_AUTO_REASONING,
      showToolCallLog: display.showToolCallLog,
      showDebugRawJson: display.showDebugRawJson,
      showStats: display.showStats,
      tutorEnabled,
      // Explicitly track toolCalls length for reactivity
      toolCallsLength: message?.toolCalls?.length ?? 0,
    };
  }, shallow);

  return { ...selection };
}
