import type { Chat, Message, ORModel } from '@/lib/types';
import { estimateTokens } from '@/lib/tokenEstimate';

// Construct the message payload for the LLM from prior conversation, with a simple token window
export function buildChatCompletionMessages(params: {
  chat: Chat;
  priorMessages: Message[];
  models: ORModel[];
  newUserContent?: string;
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const { chat, priorMessages, models, newUserContent } = params;
  const modelInfo = models.find((m) => m.id === chat.settings.model);
  const contextLimit = modelInfo?.context_length ?? 8000;
  const reservedForCompletion = typeof chat.settings.max_tokens === 'number' ? chat.settings.max_tokens : 1024;
  const maxPromptTokens = Math.max(512, contextLimit - reservedForCompletion);

  // Convert prior messages into OpenAI-style messages, excluding empty placeholders
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of priorMessages) {
    if (m.role === 'system') continue; // prefer current chat.settings.system
    if (!m.content) continue;
    if (m.role === 'user' || m.role === 'assistant') {
      history.push({ role: m.role, content: m.content });
    }
  }
  if (typeof newUserContent === 'string') {
    history.push({ role: 'user', content: newUserContent });
  }

  // Keep most recent messages within the token budget
  const historyWithTokens = history.map((msg) => ({ ...msg, tokens: estimateTokens(msg.content) ?? 1 }));
  let running = 0;
  const kept: { role: 'user' | 'assistant'; content: string }[] = [];
  for (let i = historyWithTokens.length - 1; i >= 0; i--) {
    const t = historyWithTokens[i].tokens as number;
    if (running + t > maxPromptTokens) break;
    kept.push({ role: historyWithTokens[i].role, content: historyWithTokens[i].content });
    running += t;
  }
  kept.reverse();

  const finalMsgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (chat.settings.system && chat.settings.system.trim()) {
    finalMsgs.push({ role: 'system', content: chat.settings.system });
  }
  finalMsgs.push(...kept);
  return finalMsgs;
}

