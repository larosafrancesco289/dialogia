import { useCallback, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import type { Chat, Message, MessageTutor, ModelDescriptor } from '@/lib/types';
import type { UIDebugState, UISearchState } from '@/lib/store/types';
import { selectIsStreamingForChat, selectIsTutorEnabledForChat } from '@/lib/store/selectors';
const EMPTY_AUTO_REASONING: Record<string, boolean> = {};

export type MessageCardViewModel = {
  message?: Message;
  chat?: Chat;
  models: ModelDescriptor[];
  isStreaming: boolean;
  braveGloballyEnabled: boolean;
  braveEntry?: NonNullable<UISearchState['braveByMessageId']>[string];
  debugMode: boolean;
  debugEntry?: NonNullable<UIDebugState['byMessageId']>[string];
  tutorGloballyEnabled: boolean;
  tutorEntry?: MessageTutor;
  autoReasoningModelIds: Record<string, boolean>;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
  showStats: boolean;
  tutorEnabled: boolean;
  actions: {
    branchFromMessage: () => void;
    regenerateMessage: (modelId?: string) => void;
  };
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
    const tutorEntry = state.ui.tutor.byMessageId?.[messageId] ?? message?.tutor;
    const tutorGloballyEnabled = !!state.ui.flags.experimentalTutor;
    const tutorEnabled = selectIsTutorEnabledForChat(chatId)(state);

    return {
      message,
      chat,
      models: state.models,
      isStreaming: selectIsStreamingForChat(chatId)(state),
      braveGloballyEnabled: !!state.ui.flags.experimentalBrave,
      braveEntry: state.ui.search.braveByMessageId?.[messageId],
      debugMode: !!state.ui.debug.mode,
      debugEntry: state.ui.debug.byMessageId?.[messageId],
      tutorGloballyEnabled,
      tutorEntry,
      autoReasoningModelIds: state.ui.debug.autoReasoningModelIds ?? EMPTY_AUTO_REASONING,
      showToolCallLog: !!chat?.settings?.ui.showToolCallLog,
      showDebugRawJson: chat?.settings?.ui.showDebugRawJson ?? true,
      showStats: chat?.settings?.ui.showStats ?? false,
      tutorEnabled,
    };
  }, shallow);

  const { branchChatFromMessage, regenerateAssistantMessage } = useChatStore(
    (state) => ({
      branchChatFromMessage: state.branchChatFromMessage,
      regenerateAssistantMessage: state.regenerateAssistantMessage,
    }),
    shallow,
  );

  const branchFromMessage = useCallback(() => {
    if (selection.isStreaming) return;
    branchChatFromMessage(messageId);
  }, [branchChatFromMessage, messageId, selection.isStreaming]);

  const regenerateMessage = useCallback(
    (modelId?: string) => {
      regenerateAssistantMessage(messageId, modelId ? { modelId } : undefined);
    },
    [messageId, regenerateAssistantMessage],
  );

  const actions = useMemo(
    () => ({
      branchFromMessage,
      regenerateMessage,
    }),
    [branchFromMessage, regenerateMessage],
  );

  return { ...selection, actions };
}
