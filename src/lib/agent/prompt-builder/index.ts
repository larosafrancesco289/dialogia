import type {
  Chat,
  Message,
  MessageToolRound,
  ModelDescriptor,
  PersistedAttachment,
} from '@/lib/types';
import type { ModelMessage } from '@/lib/agent/types';
import { TokenBudgeter } from './TokenBudgeter';
import { createToolCallIdAllocator, replayAssistantTurn } from './replay';
import { AttachmentProcessor } from '@/lib/attachments/prompt';
import { formatMessageTimestamp } from '@/lib/agent/prompts/timestamps';
import { estimateTokens } from '@/lib/tokenEstimate';

export function buildChatCompletionMessages(params: {
  chat: Chat;
  priorMessages: Message[];
  models: ModelDescriptor[];
  newUserContent?: string;
  newUserAttachments?: PersistedAttachment[];
  timestamps?: boolean;
}): ModelMessage[] {
  const { chat, priorMessages, models, newUserContent, newUserAttachments, timestamps } = params;
  const modelInfo = models.find((m) => m.id === chat.settings.modelId);
  const contextLimit = modelInfo?.context_length ?? 8000;
  const reserved =
    typeof chat.settings.generation.maxTokens === 'number'
      ? chat.settings.generation.maxTokens
      : 1024;

  // 1. Normalize History
  const history: {
    role: 'user' | 'assistant';
    content: string;
    createdAt?: number;
    attachments?: PersistedAttachment[];
    annotations?: Message['annotations'];
    /** Replayed as real tool calls; budgeted with the message, never apart from it. */
    toolRounds?: MessageToolRound[];
    extraTokens?: number;
  }[] = [];

  for (const m of priorMessages) {
    if (m.role === 'system') continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const base = typeof m.content === 'string' ? m.content : '';
    const hidden = m.hiddenContent;
    const combined =
      m.role === 'assistant'
        ? [base, typeof hidden === 'string' ? hidden : ''].filter((x) => x && x.trim()).join('\n\n')
        : base;
    const toolRounds =
      m.role === 'assistant' && Array.isArray(m.toolRounds) && m.toolRounds.length > 0
        ? m.toolRounds
        : undefined;
    if (!combined && !toolRounds) continue;
    history.push({
      role: m.role,
      content: combined,
      createdAt: m.createdAt,
      attachments: m.attachments,
      annotations: m.annotations,
      ...(toolRounds
        ? { toolRounds, extraTokens: estimateTokens(JSON.stringify(toolRounds)) ?? 1 }
        : {}),
    });
  }

  if (typeof newUserContent === 'string') {
    history.push({
      role: 'user',
      content: newUserContent,
      createdAt: Date.now(),
      attachments: newUserAttachments,
    });
  }

  // 2. Budget Tokens
  const budgeter = new TokenBudgeter(contextLimit, reserved);
  const indicesToKeep = budgeter.budget(history);
  const kept = indicesToKeep.map((i) => history[i]);

  // 3. Format Messages
  const finalMsgs: ModelMessage[] = [];
  const allocateToolCallId = createToolCallIdAllocator();

  // System
  if (chat.settings.system && chat.settings.system.trim()) {
    finalMsgs.push({ role: 'system', content: chat.settings.system.trim() });
  }

  // Conversation
  for (const k of kept) {
    const stamp = (text: string) =>
      timestamps && typeof k.createdAt === 'number'
        ? `[${formatMessageTimestamp(k.createdAt)}] ${text}`
        : text;
    if (k.role === 'assistant' && k.toolRounds) {
      finalMsgs.push(
        ...replayAssistantTurn({
          content: k.content,
          rounds: k.toolRounds,
          allocateId: allocateToolCallId,
          decorate: stamp,
          annotations: k.annotations,
        }),
      );
      continue;
    }
    const content = stamp(k.content);
    if (k.role === 'user' && Array.isArray(k.attachments) && k.attachments.length > 0) {
      const blocks = AttachmentProcessor.process(k.attachments);
      if (content && content.trim()) {
        blocks.unshift({ type: 'text', text: content });
      }
      finalMsgs.push({ role: 'user', content: blocks });
    } else if (k.role === 'assistant') {
      if (k.annotations) {
        finalMsgs.push({ role: 'assistant', content, annotations: k.annotations });
      } else {
        finalMsgs.push({ role: 'assistant', content });
      }
    } else {
      finalMsgs.push({ role: 'user', content });
    }
  }

  return finalMsgs;
}
