import { buildTutorFallbackContent } from '@/lib/agent/streamHandlers';
import type { TurnStoreState } from '@/lib/agent/contracts';
import type { Message } from '@/lib/types';

type ShortCircuitFinalizeArgs = {
  chatId: string;
  assistantMessage: Message;
  lifecycle: { buildShortCircuitMessage: (message: Message) => Message };
  getState: () => TurnStoreState;
  updateMessage: (messageId: string, patch: Partial<Message>) => void;
  persistMessage: (message: Message) => Promise<void>;
  fallbackText?: string;
};

export async function finalizeShortCircuitMessage(
  args: ShortCircuitFinalizeArgs,
): Promise<Message> {
  const { chatId, assistantMessage, lifecycle, getState, updateMessage, persistMessage } = args;
  const fallbackText =
    args.fallbackText ?? 'I added new tutor content above. Let me know when you are ready.';

  const state = getState();
  const currentList = state.messages[chatId] ?? [];
  const current = currentList.find((m) => m.id === assistantMessage.id);
  const baseMessage: Message = (current as Message | undefined) ?? assistantMessage;
  const finalMsgBase: Message = lifecycle.buildShortCircuitMessage({
    ...baseMessage,
    content: current?.content ?? baseMessage.content ?? '',
    reasoning: current?.reasoning ?? baseMessage.reasoning,
    attachments: current?.attachments ?? baseMessage.attachments,
    tutor: (current as any)?.tutor ?? (baseMessage as any)?.tutor,
    hiddenContent:
      (current as any)?.hiddenContent ?? (baseMessage as any)?.hiddenContent ?? undefined,
  });

  const fallbackContent =
    (finalMsgBase.content || '').trim() ||
    buildTutorFallbackContent(state, assistantMessage.id) ||
    fallbackText;
  const finalMsg: Message = { ...finalMsgBase, content: fallbackContent };

  updateMessage(assistantMessage.id, finalMsg);
  await persistMessage(finalMsg);
  return finalMsg;
}
