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
import { NOTICE_SAVE_FAILED, cutOffFor } from '@/lib/store/notices';
import { isRecord } from '@/lib/utils/guards';
import { mergeAnnotations } from '@/lib/api/annotations';

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
  autoReasoningEligible?: boolean;
  modelIdUsed?: string;
  clearController?: () => void;
  persistMessage: (message: Message) => Promise<void>;
};

export type MessageStreamCallbacks = StreamCallbacks & {
  discardPendingText: () => void;
  /**
   * Starts another round of the same reply (agent mode): its thinking gets a
   * reasoning entry of its own, and its text is set off from what is already on
   * screen by a blank line.
   */
  beginRound: () => void;
};

/** The reply text as stored: no leading tool JSON, no echoed timestamp, trimmed. */
export function cleanStreamedText(text: string, timestamps: boolean): string {
  const raw = stripLeadingToolJson(text || '');
  const cleaned = timestamps ? stripLeadingTimestamp(raw) : raw;
  return cleaned?.trim() || '';
}

/** Calls `fn` when the page is hidden or closing; returns the unsubscribe. */
function onPageHidden(fn: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') fn();
  };
  window.addEventListener('pagehide', fn);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pagehide', fn);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function createMessageStreamCallbacks(
  options: MessageStreamOptions,
  timing: { startedAt: number },
): MessageStreamCallbacks {
  const {
    chatId,
    assistantMessage,
    set,
    get,
    autoReasoningEligible,
    modelIdUsed,
    clearController,
    persistMessage,
  } = options;

  let firstTokenAt: number | undefined;
  let reasoningActivityId: string | undefined;
  // Thinking is timed from the round's request, not its first streamed
  // thought, so a model that thinks silently first still shows how long.
  let roundSentAt = Date.now();

  // Periodically checkpoint the partial response to storage so a crash or
  // reload mid-stream loses at most a second of it. Often enough to matter:
  // a reload tears the page down before a write begun on its way out lands.
  const CHECKPOINT_INTERVAL_MS = 1000;
  let checkpointTimer: ReturnType<typeof setTimeout> | null = null;
  let turnFinished = false;

  const clearCheckpointTimer = () => {
    if (checkpointTimer) {
      clearTimeout(checkpointTimer);
      checkpointTimer = null;
    }
  };

  // On disk a checkpoint says it is one: if the page closes now, the reply
  // reads as cut off rather than finished. The final write clears the mark.
  const persistCheckpoint = (cutOff: NonNullable<Message['cutOff']> = 'interrupted') => {
    if (turnFinished) return;
    const current = get().messagesById[assistantMessage.id];
    if (!current) return;
    void Promise.resolve(persistMessage({ ...current, cutOff })).catch(() => undefined);
  };

  // A page put away (another tab, a phone's home screen) may never run the
  // next timer, or be closed from there: save what is on screen now.
  const checkpointNow = () => {
    reasoningAccumulator.flush();
    contentAccumulator.flush();
    clearCheckpointTimer();
    persistCheckpoint();
  };
  // Watched from the stream's first token: a stream that has begun always
  // ends in onDone or onError, which stop it; a request refused before then
  // never starts watching (its placeholder is already marked on disk).
  let stopCheckpointingOnHide = () => {};
  let watchingPage = false;
  const watchPage = () => {
    if (watchingPage || turnFinished) return;
    watchingPage = true;
    stopCheckpointingOnHide = onPageHidden(checkpointNow);
  };

  const scheduleCheckpoint = () => {
    if (turnFinished || checkpointTimer) return;
    checkpointTimer = setTimeout(() => {
      checkpointTimer = null;
      persistCheckpoint();
    }, CHECKPOINT_INTERVAL_MS);
  };

  // Thinking ends where the answer begins: close the reasoning entry and
  // note how long it took, so the ledger stops reading as live.
  let reasoningOpen = false;
  const settleReasoning = () => {
    if (!reasoningOpen || !reasoningActivityId) return;
    reasoningOpen = false;
    const id = reasoningActivityId;
    const now = Date.now();
    applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => {
      const activity = Array.isArray(msg.activity) ? msg.activity : [];
      if (!activity.some((item) => item.id === id && item.status !== 'done')) return msg;
      return {
        ...msg,
        activity: activity.map((item) =>
          item.type === 'reasoning' && item.id === id && item.status !== 'done'
            ? { ...item, status: 'done', duration: Math.max(0, now - item.timestamp) }
            : item,
        ),
      };
    });
  };

  const flushDelta = (delta: string) => {
    if (!delta) return;
    // Thinking still waiting for a frame is shown first, so it settles at the
    // first word rather than staying open until the reply ends.
    reasoningAccumulator.flush();
    settleReasoning();
    applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => ({
      ...msg,
      content: msg.content + delta,
    }));
    scheduleCheckpoint();
  };

  const contentAccumulator = createStreamAccumulator(flushDelta);

  // Set by `beginRound`: the next visible text starts a new paragraph, unless
  // nothing is on screen yet. Whitespace a round opens with is dropped.
  let roundSeparatorPending = false;
  const emitContent = (text: string) => {
    if (!roundSeparatorPending) {
      contentAccumulator.push(text);
      return;
    }
    const lead = text.trimStart();
    if (!lead) return;
    roundSeparatorPending = false;
    const onScreen = get().messagesById[assistantMessage.id]?.content ?? '';
    contentAccumulator.push(onScreen.trim() ? `\n\n${lead}` : lead);
  };

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
      emitContent(text);
      return;
    }
    timestampHold += text;
    const stripped = stripLeadingTimestamp(timestampHold);
    if (stripped === timestampHold && isPartialTimestampPrefix(timestampHold)) return;
    timestampGateOpen = true;
    timestampHold = '';
    if (stripped) emitContent(stripped);
  };

  const releaseTimestampHold = () => {
    if (timestampGateOpen || !timestampHold) return;
    timestampGateOpen = true;
    const toEmit = stripLeadingTimestamp(timestampHold);
    timestampHold = '';
    if (toEmit) emitContent(toEmit);
  };

  const updateReasoning = (delta: string) => {
    if (!delta) return;
    reasoningOpen = true;
    set((state) => {
      const result = updateMessageById(state, chatId, assistantMessage.id, (msg) => {
        const activity = Array.isArray(msg.activity) ? msg.activity : [];
        let nextActivity = activity;
        const previous = msg.reasoning || '';
        // A new round's (or a new stream's) thinking is a new paragraph of the
        // reply's reasoning, not a continuation of the last sentence.
        let appendix = delta;
        if (!reasoningActivityId) {
          if (previous.trim()) appendix = `${/\n$/.test(previous) ? '\n' : '\n\n'}${delta}`;
          reasoningActivityId = uuidv4();
          nextActivity = [
            ...activity,
            {
              id: reasoningActivityId,
              type: 'reasoning',
              text: delta,
              timestamp: roundSentAt,
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
          reasoning: previous + appendix,
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
    // A stream reports its whole set so far; a reply's later streams (agent
    // rounds, the closing answer) add theirs to what the earlier ones cited.
    onAnnotations: (annotations: unknown) => {
      applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => ({
        ...msg,
        annotations: mergeAnnotations(msg.annotations, annotations),
      }));
    },
    onImage: (dataUrl: string) => {
      applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => {
        const prev = Array.isArray(msg.attachments) ? msg.attachments : [];
        if (
          prev.some((attachment) => attachment.kind === 'image' && attachment.dataURL === dataUrl)
        )
          return msg;
        const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || 'image/png';
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
      watchPage();
      pushContent(delta);
    },
    onReasoningToken: (delta: string) => {
      watchPage();
      // Thinking is timed on the reasoning line; the colophon's "first word"
      // is the first word of the answer.
      reasoningAccumulator.push(delta);
    },
    onDone: async (full: string, extras?: StreamDoneExtras) => {
      reasoningAccumulator.flush();
      contentAccumulator.flush();
      settleReasoning();
      turnFinished = true;
      clearCheckpointTimer();
      stopCheckpointingOnHide();

      const state = get();
      const current = state.messagesById[assistantMessage.id];
      // Its chat was deleted while it streamed: saving it would leave an orphan row.
      if (!current) {
        clearController?.();
        return;
      }
      const finishedAt = performance.now();
      const metrics = computeMetrics({
        startedAt: timing.startedAt,
        firstTokenAt,
        finishedAt,
        usage: extras?.usage,
      });
      const content = cleanStreamedText(full, state.ui.messageTimestamps === true);
      // Fields set on the message during the turn (a module's patch, say) are
      // kept: the store copy is the turn's record, the stream adds the ending.
      const finalMessage: Message = {
        ...assistantMessage,
        ...current,
        content,
        reasoning: current?.reasoning,
        activity: current?.activity ?? assistantMessage.activity,
        attachments: current?.attachments,
        genSettings: current?.genSettings,
        hiddenContent: current?.hiddenContent,
        toolCalls: current?.toolCalls ?? assistantMessage.toolCalls,
        toolRounds: current?.toolRounds,
        metrics,
        usage: extras?.usage,
        tokensIn: metrics.promptTokens,
        tokensOut: metrics.completionTokens,
        annotations: current?.annotations ?? extras?.annotations,
        finishReason: extras?.finishReason,
        cutOff: undefined,
        cutOffReason: undefined,
        stopPolicy:
          extras?.finishReason === 'content_filter'
            ? extractStopPolicy(extras?.stopDetails)
            : undefined,
      };
      applyMessageUpdate(set, chatId, assistantMessage.id, () => finalMessage);
      try {
        await persistMessage(finalMessage);
      } catch {
        // The row stays at its last checkpoint; the person should know why.
        notify(get, NOTICE_SAVE_FAILED);
      } finally {
        clearController?.();
      }
    },
    onError: (error: Error) => {
      releaseTimestampHold();
      reasoningAccumulator.flush();
      contentAccumulator.flush();
      // Stopped or failed mid-thought: the thinking still ends here.
      settleReasoning();
      clearCheckpointTimer();
      // Persist whatever partial content made it into the store so the user
      // does not lose it on reload after a failed stream, marked as cut off.
      const marks = cutOffFor(error);
      applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => ({ ...msg, ...marks }));
      persistCheckpoint(marks.cutOff);
      turnFinished = true;
      stopCheckpointingOnHide();
      // The reply says why where it stopped; a toast is for a chat that is
      // not on screen (over an open one it covered the first message).
      if (marks.cutOffReason && get().selectedChatId !== chatId) notify(get, marks.cutOffReason);
      clearController?.();
    },
    discardPendingText: () => {
      timestampHold = '';
      contentAccumulator.cancel();
    },
    beginRound: () => {
      releaseTimestampHold();
      reasoningAccumulator.flush();
      contentAccumulator.flush();
      settleReasoning();
      reasoningActivityId = undefined;
      roundSentAt = Date.now();
      // Each round may echo the timestamp prefix again; hold it back as on the first.
      timestampGateOpen = false;
      roundSeparatorPending = true;
    },
  };

  return callbacks;
}
