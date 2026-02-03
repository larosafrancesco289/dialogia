import type { Chat, Message, ModelDescriptor, PersistedAttachment } from '@/lib/types';
import type { ModelMessage } from '@/lib/agent/types';
import { TokenBudgeter } from './TokenBudgeter';
import { AttachmentProcessor } from '@/lib/attachments/prompt';

export function buildChatCompletionMessages(params: {
  chat: Chat;
  priorMessages: Message[];
  models: ModelDescriptor[];
  newUserContent?: string;
  newUserAttachments?: PersistedAttachment[];
}): ModelMessage[] {
  const { chat, priorMessages, models, newUserContent, newUserAttachments } = params;
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
    attachments?: PersistedAttachment[];
    annotations?: Message['annotations'];
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
    if (!combined) continue;
    history.push({
      role: m.role,
      content: combined,
      attachments: m.attachments,
      annotations: m.annotations,
    });
  }

  if (typeof newUserContent === 'string') {
    history.push({
      role: 'user',
      content: newUserContent,
      attachments: newUserAttachments,
    });
  }

  // 2. Budget Tokens
  const budgeter = new TokenBudgeter(contextLimit, reserved);
  const indicesToKeep = budgeter.budget(history);
  const kept = indicesToKeep.map((i) => history[i]);

  // 3. Format Messages
  const finalMsgs: ModelMessage[] = [];

  // System
  if (chat.settings.system && chat.settings.system.trim()) {
    finalMsgs.push({ role: 'system', content: chat.settings.system.trim() });
  }

  // Conversation
  for (const k of kept) {
    if (k.role === 'user' && Array.isArray(k.attachments) && k.attachments.length > 0) {
      const blocks = AttachmentProcessor.process(k.attachments);
      if (k.content && k.content.trim()) {
        blocks.unshift({ type: 'text', text: k.content });
      }
      finalMsgs.push({ role: 'user', content: blocks });
    } else if (k.role === 'assistant') {
      if (k.annotations) {
        finalMsgs.push({ role: 'assistant', content: k.content, annotations: k.annotations });
      } else {
        finalMsgs.push({ role: 'assistant', content: k.content });
      }
    } else {
      finalMsgs.push({ role: 'user', content: k.content });
    }
  }

  return finalMsgs;
}
