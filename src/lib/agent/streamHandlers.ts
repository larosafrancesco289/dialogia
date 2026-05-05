import { v4 as uuidv4 } from 'uuid';
import { stripLeadingToolJson } from '@/lib/agent/streaming/stripToolJson';
import { createTypewriter } from '@/lib/agent/streaming/typewriter';
import type { Message } from '@/lib/types';
import type { TurnStoreState } from '@/lib/agent/contracts';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { computeMetrics } from '@/lib/turns/runtime';
import type { StreamCallbacks, StreamDoneExtras } from '@/lib/transport/types';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { notify } from '@/lib/store/notify';

type MessageUpdater = (message: Message) => Message;

const applyMessageUpdate = (
  set: StoreSetter,
  chatId: string,
  messageId: string,
  updater: MessageUpdater,
): Message | undefined => {
  let updated: Message | undefined;
  set((state) => {
    const result = updateMessageById(state, chatId, messageId, (message) => {
      const next = updater(message);
      updated = next;
      return next;
    });
    return result ? (result as Partial<TurnStoreState>) : {};
  });
  return updated;
};

export type MessageStreamOptions = {
  chatId: string;
  assistantMessage: Message;
  set: StoreSetter;
  get: StoreGetter;
  startBuffered?: boolean;
  autoReasoningEligible?: boolean;
  modelIdUsed?: string;
  clearController?: () => void;
  persistMessage: (message: Message) => Promise<void>;
};

export function createMessageStreamCallbacks(
  options: MessageStreamOptions,
  timing: { startedAt: number },
): StreamCallbacks {
  const {
    chatId,
    assistantMessage,
    set,
    get,
    startBuffered,
    autoReasoningEligible,
    modelIdUsed,
    clearController,
    persistMessage,
  } = options;

  let startedStreaming = startBuffered ? false : true;
  let leadingBuffer = '';
  let firstTokenAt: number | undefined;
  let reasoningActivityId: string | undefined;

  const flushDelta = (delta: string) => {
    if (!delta) return;
    applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => ({
      ...msg,
      content: msg.content + delta,
    }));
  };

  // Typewriter for smooth character-by-character emission
  const typewriter = createTypewriter(flushDelta);

  const updateReasoning = (delta: string) => {
    if (!delta) return;
    set((state) => {
      const result = updateMessageById(state, chatId, assistantMessage.id, (msg) => {
        const activity = Array.isArray(msg.activity) ? msg.activity : [];
        let nextActivity = activity;
        if (!reasoningActivityId) {
          reasoningActivityId = uuidv4();
          nextActivity = [
            ...activity,
            {
              id: reasoningActivityId,
              type: 'reasoning',
              text: delta,
              timestamp: Date.now(),
              status: 'streaming',
            },
          ];
        } else {
          nextActivity = activity.map((item) =>
            item.type === 'reasoning' && item.id === reasoningActivityId
              ? { ...item, text: item.text + delta, status: 'streaming' }
              : item,
          );
        }
        return {
          ...msg,
          reasoning: (msg.reasoning || '') + delta,
          activity: nextActivity,
        };
      });
      const partial: Partial<TurnStoreState> = result ? (result as Partial<TurnStoreState>) : {};
      if (autoReasoningEligible && modelIdUsed) {
        const prev = state.ui.debug.autoReasoningModelIds || {};
        if (!prev[modelIdUsed]) {
          partial.ui = {
            ...state.ui,
            debug: {
              ...state.ui.debug,
              autoReasoningModelIds: { ...prev, [modelIdUsed]: true },
            },
          };
        }
      }
      return partial;
    });
  };

  // Typewriter for reasoning tokens (separate buffer)
  const reasoningTypewriter = createTypewriter(updateReasoning);

  const callbacks = {
    onAnnotations: (annotations: unknown) => {
      applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => ({
        ...msg,
        annotations,
      }));
    },
    onImage: (dataUrl: string) => {
      applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => {
        const prev = Array.isArray(msg.attachments) ? msg.attachments : [];
        if (
          prev.some((attachment) => attachment.kind === 'image' && attachment.dataURL === dataUrl)
        )
          return msg;
        const mime = (() => {
          const slice = dataUrl.slice(5, dataUrl.indexOf(';'));
          return slice || 'image/png';
        })();
        const next = [
          ...prev,
          {
            id: uuidv4(),
            kind: 'image' as const,
            name: 'generated',
            mime,
            dataURL: dataUrl,
          },
        ];
        return { ...msg, attachments: next } as Message;
      });
    },
    onToken: (delta: string) => {
      if (firstTokenAt == null) firstTokenAt = performance.now();
      if (!startedStreaming) {
        leadingBuffer += delta;
        const trimmed = leadingBuffer.trimStart();
        const looksStructured = trimmed.startsWith('{') || trimmed.startsWith('```');
        if (looksStructured) {
          const stripped = stripLeadingToolJson(leadingBuffer);
          const rest = stripped.trimStart();
          if (rest && !(rest.startsWith('{') || rest.startsWith('```'))) {
            startedStreaming = true;
            leadingBuffer = '';
            typewriter.push(stripped);
          }
        } else if (leadingBuffer.length > 512) {
          startedStreaming = true;
          const toEmit = leadingBuffer;
          leadingBuffer = '';
          typewriter.push(toEmit);
        }
      } else {
        typewriter.push(delta);
      }
    },
    onReasoningToken: (delta: string) => {
      if (firstTokenAt == null) firstTokenAt = performance.now();
      reasoningTypewriter.push(delta);
    },
    onDone: async (full: string, extras?: StreamDoneExtras) => {
      // Flush any remaining buffered content immediately on completion
      typewriter.flush();
      reasoningTypewriter.flush();

      const state = get();
      const current = state.messagesById[assistantMessage.id];
      const finishedAt = performance.now();
      const metrics = computeMetrics({
        startedAt: timing.startedAt,
        firstTokenAt,
        finishedAt,
        usage: extras?.usage,
      });
      const rawContent = stripLeadingToolJson(full || '');
      const content = rawContent?.trim() || '';
      const finalMessage: Message = {
        ...assistantMessage,
        content,
        reasoning: current?.reasoning,
        activity: (current?.activity ?? assistantMessage.activity)?.map((item) =>
          item.type === 'reasoning' && item.id === reasoningActivityId
            ? { ...item, status: 'done' }
            : item,
        ),
        attachments: current?.attachments,
        systemSnapshot: current?.systemSnapshot,
        genSettings: current?.genSettings,
        tutor: current?.tutor,
        hiddenContent: current?.hiddenContent,
        toolCalls: current?.toolCalls ?? assistantMessage.toolCalls,
        metrics,
        usage: extras?.usage,
        tokensIn: metrics.promptTokens,
        tokensOut: metrics.completionTokens,
        annotations: current?.annotations ?? extras?.annotations,
      };
      applyMessageUpdate(set, chatId, assistantMessage.id, () => finalMessage);
      await persistMessage(finalMessage);
      clearController?.();
    },
    onError: (error: Error) => {
      // Flush typewriters immediately on error (user cancellation, etc.)
      typewriter.flush();
      reasoningTypewriter.flush();
      notify(get, error.message);
      clearController?.();
    },
  };

  return callbacks;
}
