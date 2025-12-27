import { v4 as uuidv4 } from 'uuid';
import { stripLeadingToolJson } from '@/lib/agent/streaming';
import type { Message } from '@/lib/types';
import type { TurnStoreState } from '@/lib/agent/contracts';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { computeMetrics } from '@/lib/services/metrics';
import type { StreamCallbacks, StreamDoneExtras } from '@/lib/transport/types';

type MessageUpdater = (message: Message) => Message;

const buildMessageUpdate = (
  state: TurnStoreState,
  chatId: string,
  messageId: string,
  updater: MessageUpdater,
): { messages?: Record<string, Message[]>; updated?: Message } => {
  const list = state.messages[chatId];
  if (!Array.isArray(list) || list.length === 0) return {};
  let updated: Message | undefined;
  let changed = false;
  const nextList = list.map((message) => {
    if (message.id !== messageId) return message;
    updated = updater(message);
    changed = true;
    return updated;
  });
  if (!changed) return { updated };
  return {
    messages: {
      ...state.messages,
      [chatId]: nextList,
    },
    updated,
  };
};

const applyMessageUpdate = (
  set: StoreSetter,
  chatId: string,
  messageId: string,
  updater: MessageUpdater,
): Message | undefined => {
  let updated: Message | undefined;
  set((state) => {
    const result = buildMessageUpdate(state, chatId, messageId, updater);
    updated = result.updated;
    return result.messages ? ({ messages: result.messages } as Partial<TurnStoreState>) : {};
  });
  return updated;
};

export function buildTutorFallbackContent(
  state: TurnStoreState,
  assistantId: string,
): string | undefined {
  const tutorEntry = state.ui.tutor.byMessageId?.[assistantId];
  if (!tutorEntry) return undefined;

  const snippets: string[] = [];
  const questionnaire = tutorEntry.questionnaire;
  if (questionnaire?.questions?.length) {
    snippets.push(
      `I posted a quick questionnaire (${questionnaire.questions.length} question${
        questionnaire.questions.length === 1 ? '' : 's'
      }) to tailor the plan—please fill it in first.`,
    );
  }

  const plan = tutorEntry.planProposal?.plan;
  if (plan?.goal) {
    const nodes = Array.isArray(plan.nodes) ? plan.nodes.length : undefined;
    const summaryParts = [
      `I drafted a plan "${plan.goal}"`,
      nodes ? `(${nodes} step${nodes === 1 ? '' : 's'})` : undefined,
    ].filter(Boolean);
    const summary = summaryParts.join(' ');
    const needsConfirmation = tutorEntry.planProposal?.requiresConfirmation;
    const ask = needsConfirmation
      ? 'Approve or suggest tweaks and I will guide you through the first step.'
      : 'Tell me if you want to start or adjust it.';
    snippets.push(`${summary}. ${ask}`);
  }

  const quizCount = Array.isArray(tutorEntry.mcq) ? tutorEntry.mcq.length : 0;
  if (quizCount > 0) {
    const title = tutorEntry.title || 'a quick check';
    snippets.push(`I added ${title} (${quizCount} MCQ). Try it now for a fast readiness check.`);
  }

  if (snippets.length === 0) return undefined;
  const nextStep =
    'If you prefer, ask for a brief summary or a quick checklist and I will share it.';
  return `${snippets.join(' ')} ${nextStep}`.trim();
}

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

  const flushDelta = (delta: string) => {
    if (!delta) return;
    applyMessageUpdate(set, chatId, assistantMessage.id, (msg) => ({
      ...msg,
      content: msg.content + delta,
    }));
  };

  const updateReasoning = (delta: string) => {
    if (!delta) return;
    set((state) => {
      const result = buildMessageUpdate(state, chatId, assistantMessage.id, (msg) => ({
        ...msg,
        reasoning: (msg.reasoning || '') + delta,
      }));
      const partial: Partial<TurnStoreState> = result.messages ? { messages: result.messages } : {};
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
            flushDelta(stripped);
          }
        } else if (leadingBuffer.length > 512) {
          startedStreaming = true;
          const toEmit = leadingBuffer;
          leadingBuffer = '';
          flushDelta(toEmit);
        }
      } else {
        flushDelta(delta);
      }
    },
    onReasoningToken: (delta: string) => {
      if (firstTokenAt == null) firstTokenAt = performance.now();
      updateReasoning(delta);
    },
    onDone: async (full: string, extras?: StreamDoneExtras) => {
      set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
      const state = get();
      const currentMessages = state.messages[chatId] ?? [];
      const current = currentMessages.find((msg) => msg.id === assistantMessage.id);
      const finishedAt = performance.now();
      const metrics = computeMetrics({
        startedAt: timing.startedAt,
        firstTokenAt,
        finishedAt,
        usage: extras?.usage,
      });
      const rawContent = stripLeadingToolJson(full || '');
      const content =
        rawContent && rawContent.trim()
          ? rawContent
          : (buildTutorFallbackContent(state, assistantMessage.id) ??
            'I added new tutor content above. Let me know when you are ready.');
      const finalMessage: Message = {
        ...assistantMessage,
        content,
        reasoning: current?.reasoning,
        attachments: current?.attachments,
        systemSnapshot: current?.systemSnapshot,
        genSettings: current?.genSettings,
        tutor: current?.tutor,
        hiddenContent: current?.hiddenContent,
        toolCalls: current?.toolCalls ?? assistantMessage.toolCalls,
        metrics,
        tokensIn: metrics.promptTokens,
        tokensOut: metrics.completionTokens,
        annotations: current?.annotations ?? extras?.annotations,
      };
      applyMessageUpdate(set, chatId, assistantMessage.id, () => finalMessage);
      await persistMessage(finalMessage);
      clearController?.();
    },
    onError: (error: Error) => {
      set((state) => ({ ui: { ...state.ui, isStreaming: false, notice: error.message } }));
      clearController?.();
    },
  };

  return callbacks;
}
