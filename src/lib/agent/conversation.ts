import type { Chat, Message, ORModel, Attachment } from '@/lib/types';
import { estimateTokens } from '@/lib/tokenEstimate';
import { selectExcerptsFromPdfText } from '@/lib/pdfRag';

// Construct the message payload for the LLM from prior conversation, with a simple token window
export function buildChatCompletionMessages(params: {
  chat: Chat;
  priorMessages: Message[];
  models: ORModel[];
  newUserContent?: string;
  newUserAttachments?: Attachment[];
}): any[] {
  const { chat, priorMessages, models, newUserContent, newUserAttachments } = params;
  const modelInfo = models.find((m) => m.id === chat.settings.model);
  const contextLimit = modelInfo?.context_length ?? 8000;
  const reservedForCompletion =
    typeof chat.settings.max_tokens === 'number' ? chat.settings.max_tokens : 1024;
  const maxPromptTokens = Math.max(512, contextLimit - reservedForCompletion);

  // Convert prior messages into a normalized representation (text only for token budgeting).
  const history: { role: 'user' | 'assistant'; content: string; attachments?: Attachment[] }[] = [];
  for (const m of priorMessages) {
    if (m.role === 'system') continue; // prefer current chat.settings.system
    if (!m.content) continue;
    if (m.role === 'user' || m.role === 'assistant') {
      history.push({ role: m.role, content: m.content, attachments: m.attachments });
    }
  }
  if (typeof newUserContent === 'string') {
    history.push({ role: 'user', content: newUserContent, attachments: newUserAttachments });
  }

  // Keep most recent messages within the token budget
  const historyWithTokens = history.map((msg) => ({
    ...msg,
    tokens: estimateTokens(msg.content) ?? 1,
  }));
  let running = 0;
  const kept: typeof history = [];
  for (let i = historyWithTokens.length - 1; i >= 0; i--) {
    const t = historyWithTokens[i].tokens as number;
    if (running + t > maxPromptTokens) break;
    kept.push({
      role: historyWithTokens[i].role,
      content: historyWithTokens[i].content,
      attachments: historyWithTokens[i].attachments,
    });
    running += t;
  }
  kept.reverse();

  const finalMsgs: any[] = [];
  if (chat.settings.system && chat.settings.system.trim()) {
    finalMsgs.push({ role: 'system', content: chat.settings.system });
  }
  // Transform kept messages to OpenAI-style content blocks when attachments present
  for (const k of kept) {
    if (k.role === 'user' && Array.isArray(k.attachments) && k.attachments.length > 0) {
      const blocks: any[] = [];
      // If any PDF attachments exist with extracted text, add a short preface block
      const pdfs = k.attachments.filter((a) => a.kind === 'pdf' && a.text && a.text.trim());
      if (pdfs.length > 0) {
        const budgetPerPdf = Math.max(300, Math.floor((estimateTokens(k.content) || 600) * 2));
        const parts: string[] = [];
        for (const p of pdfs) {
          const excerpt = selectExcerptsFromPdfText({
            text: p.text || '',
            query: k.content || '',
            tokenBudget: budgetPerPdf,
            chunkChars: 2500,
          });
          if (excerpt) {
            parts.push(
              `Document: ${p.name || 'PDF'}${p.pageCount ? ` (pages: ${p.pageCount})` : ''}\n\n${excerpt}`,
            );
          }
        }
        if (parts.length > 0) {
          blocks.push({
            type: 'text',
            text:
              'Use the following document excerpts to answer the user. Prefer citing specific sections.\n\n' +
              parts.join('\n\n---\n\n'),
          });
        }
      }
      if (k.content && k.content.trim()) blocks.push({ type: 'text', text: k.content });
      for (const a of k.attachments) {
        if (a.kind === 'image' && a.dataURL) {
          blocks.push({ type: 'image_url', image_url: { url: a.dataURL } });
        }
      }
      finalMsgs.push({ role: 'user', content: blocks });
    } else {
      finalMsgs.push({ role: k.role, content: k.content });
    }
  }
  return finalMsgs;
}
