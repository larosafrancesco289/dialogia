import { v4 as uuidv4 } from 'uuid';
import { stripLeadingToolJson } from '@/lib/agent/streaming';
import type { Message } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';

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

  const getMessages = () => get().messages[chatId] ?? [];

  const flushDelta = (delta: string) => {
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const updated = list.map((msg) =>
        msg.id === assistantMessage.id ? { ...msg, content: msg.content + delta } : msg,
      );
      return { messages: { ...state.messages, [chatId]: updated } } as Partial<StoreState>;
    });
  };

  const updateReasoning = (delta: string) => {
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
      const currentMessages = getMessages();
      const current = currentMessages.find((msg) => msg.id === assistantMessage.id);
      const finishedAt = performance.now();
      const ttftMs = firstTokenAt
        ? Math.max(0, Math.round(firstTokenAt - timing.startedAt))
        : undefined;
      const completionMs = Math.max(0, Math.round(finishedAt - timing.startedAt));
      const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
      const completionTokens = extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
      const tokensPerSec =
        completionTokens && completionMs
          ? +(completionTokens / (completionMs / 1000)).toFixed(2)
          : undefined;
      const finalMessage: Message = {
        ...assistantMessage,
        content: stripLeadingToolJson(full || ''),
        reasoning: current?.reasoning,
        attachments: current?.attachments,
        systemSnapshot: (current as any)?.systemSnapshot,
        genSettings: (current as any)?.genSettings,
        tutor: (current as any)?.tutor,
        hiddenContent: (current as any)?.hiddenContent,
        metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec } as any,
        tokensIn: promptTokens,
        tokensOut: completionTokens,
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
