import { v4 as uuidv4 } from 'uuid';
import { stripLeadingToolJson } from '@/lib/agent/streaming/stripToolJson';
import { isPartialTimestampPrefix, stripLeadingTimestamp } from '@/lib/agent/prompts/timestamps';
import { createStreamAccumulator } from '@/lib/agent/streaming/accumulator';
import type { Message } from '@/lib/types';
import type { TurnStoreState } from '@/lib/agent/contracts';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { computeMetrics } from '@/lib/turns/runtime';
import type { StreamCallbacks, StreamDoneExtras } from '@/lib/transport/types';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { notify } from '@/lib/store/notify';
import { describeErrorNotice } from '@/lib/store/notices';
import { isRecord } from '@/lib/utils/guards';

type MessageUpdater = (message: Message) => Message;

/** Pull the refusal policy category out of a provider stop_details payload. */
const extractStopPolicy = (stopDetails: unknown): string | undefined => {
  if (!isRecord(stopDetails)) return undefined;
  const policy = stopDetails.policy ?? stopDetails.category;
  return typeof policy === 'string' && policy ? policy : undefined;
};

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

export type MessageStreamCallbacks = StreamCallbacks & {
  discardPendingText: () => void;
};

export function createMessageStreamCallbacks(
  options: MessageStreamOptions,
  timing: { startedAt: number },
): MessageStreamCallbacks {
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

  // Periodically checkpoint the partial response to storage so a crash or
  // reload mid-stream cannot lose everything that already arrived.
  const CHECKPOINT_INTERVAL_MS = 2500;
  let checkpointTimer: ReturnType<typeof setTimeout> | null = null;
  let turnFinished = false;

  const clearCheckpointTimer = () => {
    if (checkpointTimer) {
      clearTimeout(checkpointTimer);
      checkpointTimer = null;
    }
  };

  const persistCheckpoint = () => {
    if (turnFinished) return;
    const current = get().messagesById[assistantMessage.id];
    if (!current) return;
    void Promise.resolve(persistMessage(current)).catch(() => undefined);
  };

  const scheduleCheckpoint = () => {
    if (turnFinished || checkpointTimer) return;
    checkpointTimer = setTimeout(() => {
      checkpointTimer = null;
      persistCheckpoint();
    }, CHECKPOINT_INTERVAL_MS);
  };

  const flushDelta = (delta: string) => {
    if (!delta) return;
    applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => ({
      ...msg,
      content: msg.content + delta,
    }));
    scheduleCheckpoint();
  };

  const contentAccumulator = createStreamAccumulator(flushDelta);

  // When timestamps are enabled the model occasionally echoes the
  // "[YYYY-MM-DD HH:MM] " prefix despite being told not to. Hold back the
  // first few tokens while they could still be that prefix, then either drop
  // it or release them unchanged.
  let timestampGateOpen = false;
  let timestampHold = '';
  const pushContent = (text: string) => {
    if (!text) return;
    if (!timestampGateOpen && get().ui.messageTimestamps !== true) {
      timestampGateOpen = true;
    }
    if (timestampGateOpen) {
      contentAccumulator.push(text);
      return;
    }
    timestampHold += text;
    const stripped = stripLeadingTimestamp(timestampHold);
    if (stripped === timestampHold && isPartialTimestampPrefix(timestampHold)) return;
    timestampGateOpen = true;
    timestampHold = '';
    if (stripped) contentAccumulator.push(stripped);
  };

  const releaseTimestampHold = () => {
    if (timestampGateOpen || !timestampHold) return;
    timestampGateOpen = true;
    const toEmit = stripLeadingTimestamp(timestampHold);
    timestampHold = '';
    if (toEmit) contentAccumulator.push(toEmit);
  };

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
    scheduleCheckpoint();
  };

  const reasoningAccumulator = createStreamAccumulator(updateReasoning);

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
            pushContent(stripped);
          }
        } else if (leadingBuffer.length > 512) {
          startedStreaming = true;
          const toEmit = leadingBuffer;
          leadingBuffer = '';
          pushContent(toEmit);
        }
      } else {
        pushContent(delta);
      }
    },
    onReasoningToken: (delta: string) => {
      if (firstTokenAt == null) firstTokenAt = performance.now();
      reasoningAccumulator.push(delta);
    },
    onDone: async (full: string, extras?: StreamDoneExtras) => {
      contentAccumulator.flush();
      reasoningAccumulator.flush();
      turnFinished = true;
      clearCheckpointTimer();

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
      const cleaned =
        state.ui.messageTimestamps === true ? stripLeadingTimestamp(rawContent) : rawContent;
      const content = cleaned?.trim() || '';
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
        finishReason: extras?.finishReason,
        stopPolicy:
          extras?.finishReason === 'content_filter'
            ? extractStopPolicy(extras?.stopDetails)
            : undefined,
      };
      applyMessageUpdate(set, chatId, assistantMessage.id, () => finalMessage);
      await persistMessage(finalMessage);
      clearController?.();
    },
    onError: (error: Error) => {
      releaseTimestampHold();
      contentAccumulator.flush();
      reasoningAccumulator.flush();
      clearCheckpointTimer();
      // Persist whatever partial content made it into the store so the user
      // does not lose it on reload after a failed stream.
      persistCheckpoint();
      turnFinished = true;
      const noticeMessage = describeErrorNotice(error);
      if (noticeMessage) notify(get, noticeMessage);
      clearController?.();
    },
    discardPendingText: () => {
      timestampHold = '';
      contentAccumulator.cancel();
    },
  };

  return callbacks;
}
