import type { TurnStoreState } from '@/lib/agent/contracts';
import type { Message } from '@/lib/types';

type ShortCircuitFinalizeArgs = {
  assistantMessage: Message;
  lifecycle: { buildShortCircuitMessage: (message: Message) => Message };
  getState: () => TurnStoreState;
  updateMessage: (messageId: string, patch: Partial<Message>) => void;
  persistMessage: (message: Message) => Promise<void>;
};

export async function finalizeShortCircuitMessage(
  args: ShortCircuitFinalizeArgs,
): Promise<Message> {
  const { assistantMessage, lifecycle, getState, updateMessage, persistMessage } = args;

  const state = getState();
  const current = state.messagesById[assistantMessage.id];
  const baseMessage: Message = (current as Message | undefined) ?? assistantMessage;
  const finalMsgBase: Message = lifecycle.buildShortCircuitMessage({
    ...baseMessage,
    content: current?.content ?? baseMessage.content ?? '',
    reasoning: current?.reasoning ?? baseMessage.reasoning,
    attachments: current?.attachments ?? baseMessage.attachments,
    tutor: current?.tutor ?? baseMessage.tutor,
    hiddenContent: current?.hiddenContent ?? baseMessage.hiddenContent ?? undefined,
  });

  const finalContent = (finalMsgBase.content || '').trim();
  const finalMsg: Message = { ...finalMsgBase, content: finalContent };

  updateMessage(assistantMessage.id, finalMsg);
  await persistMessage(finalMsg);
  return finalMsg;
}
