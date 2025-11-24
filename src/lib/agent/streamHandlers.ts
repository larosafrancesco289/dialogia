import { v4 as uuidv4 } from 'uuid';
import { stripLeadingToolJson } from '@/lib/agent/streaming';
import type { Message } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { computeMetrics } from '@/lib/services/metrics';

export function buildTutorFallbackContent(state: StoreState, assistantId: string): string | undefined {
  const tutorEntry = state.ui.tutorByMessageId?.[assistantId];
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
    snippets.push(
      `I added ${title} (${quizCount} MCQ). Try it now for a fast readiness check.`,
    );
  }

  if (snippets.length === 0) return undefined;
  const nextStep = 'If you prefer, ask for a brief summary or a quick checklist and I will share it.';
  return `${snippets.join(' ')} ${nextStep}`.trim();
}

export type StreamExtras = {
  usage?: {
    prompt_tokens?: number;
    input_tokens?: number;
    completion_tokens?: number;
    output_tokens?: number;
  };
  annotations?: any;
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
) {
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
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const updated = list.map((msg) =>
        msg.id === assistantMessage.id ? { ...msg, content: msg.content + delta } : msg,
      );
      return { messages: { ...state.messages, [chatId]: updated } } as Partial<StoreState>;
    });
  };

  const updateReasoning = (delta: string) => {
    if (!delta) return;
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const updated = list.map((msg) =>
        msg.id === assistantMessage.id ? { ...msg, reasoning: (msg.reasoning || '') + delta } : msg,
      );
      const partial: Partial<StoreState> = {
        messages: { ...state.messages, [chatId]: updated },
      } as any;
      if (autoReasoningEligible && modelIdUsed) {
        const prev = state.ui.autoReasoningModelIds || {};
        if (!prev[modelIdUsed]) {
          partial.ui = {
            ...state.ui,
            autoReasoningModelIds: { ...prev, [modelIdUsed]: true },
          } as any;
        }
      }
      return partial;
    });
  };

  const callbacks = {
    onAnnotations: (annotations: any) => {
      set((state) => {
        const list = state.messages[chatId] ?? [];
        const updated = list.map((msg) =>
          msg.id === assistantMessage.id ? ({ ...msg, annotations } as Message) : msg,
        );
        return { messages: { ...state.messages, [chatId]: updated } } as Partial<StoreState>;
      });
    },
    onImage: (dataUrl: string) => {
      set((state) => {
        const list = state.messages[chatId] ?? [];
        const updated = list.map((msg) => {
          if (msg.id !== assistantMessage.id) return msg;
          const prev = Array.isArray(msg.attachments) ? msg.attachments : [];
          if (
            prev.some((attachment) => attachment.kind === 'image' && attachment.dataURL === dataUrl)
          ) {
            return msg;
          }
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
        return { messages: { ...state.messages, [chatId]: updated } } as Partial<StoreState>;
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
    onDone: async (full: string, extras?: StreamExtras) => {
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
          : buildTutorFallbackContent(state as StoreState, assistantMessage.id) ??
            'I added new tutor content above. Let me know when you are ready.';
      const finalMessage: Message = {
        ...assistantMessage,
        content,
        reasoning: current?.reasoning,
        attachments: current?.attachments,
        systemSnapshot: (current as any)?.systemSnapshot,
        genSettings: (current as any)?.genSettings,
        tutor: (current as any)?.tutor,
        hiddenContent: (current as any)?.hiddenContent,
        toolCalls: (current as any)?.toolCalls ?? assistantMessage.toolCalls,
        metrics,
        tokensIn: metrics.promptTokens,
        tokensOut: metrics.completionTokens,
        annotations: current?.annotations ?? extras?.annotations,
      } as any;
      set((state) => {
        const list = state.messages[chatId] ?? [];
        const updated = list.map((msg) => (msg.id === assistantMessage.id ? finalMessage : msg));
        return { messages: { ...state.messages, [chatId]: updated } } as Partial<StoreState>;
      });
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
