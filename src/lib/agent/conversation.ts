import type { Chat, Message, ORModel, Attachment } from '@/lib/types';
import { estimateTokens } from '@/lib/tokenEstimate';
import { normalizeTutorMemory } from '@/lib/agent/tutorMemory';

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

  // Convert prior messages into a normalized representation for token budgeting.
  // IMPORTANT: include assistant hiddenContent so the model sees tutor data in follow-ups.
  const history: {
    role: 'user' | 'assistant';
    content: string;
    attachments?: Attachment[];
    annotations?: any;
  }[] = [];
  for (const m of priorMessages) {
    if (m.role === 'system') continue; // prefer current chat.settings.system
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const base = typeof m.content === 'string' ? m.content : '';
    const hidden = (m as any).hiddenContent as string | undefined;
    const combined =
      m.role === 'assistant'
        ? [base, typeof hidden === 'string' ? hidden : ''].filter((x) => x && x.trim()).join('\n\n')
        : base;
    if (!combined) continue;
    const annotations = (m as any).annotations;
    history.push({ role: m.role, content: combined, attachments: m.attachments, annotations });
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
      annotations: (historyWithTokens[i] as any).annotations,
    });
    running += t;
  }
  kept.reverse();

  const finalMsgs: any[] = [];
  const systemParts: string[] = [];
  const tutorMemory = chat.settings.tutor_mode
    ? normalizeTutorMemory(chat.settings.tutor_memory)
    : undefined;
  if (typeof tutorMemory === 'string' && tutorMemory.trim()) systemParts.push(tutorMemory.trim());
  if (chat.settings.system && chat.settings.system.trim())
    systemParts.push(chat.settings.system.trim());
  if (systemParts.length > 0) {
    finalMsgs.push({ role: 'system', content: systemParts.join('\n\n') });
  }
  // Transform kept messages to OpenAI-style content blocks when attachments present
  for (const k of kept) {
    if (k.role === 'user' && Array.isArray(k.attachments) && k.attachments.length > 0) {
      const blocks: any[] = [];
      if (k.content && k.content.trim()) blocks.push({ type: 'text', text: k.content });
      for (const a of k.attachments) {
        if (a.kind === 'image' && a.dataURL) {
          blocks.push({ type: 'image_url', image_url: { url: a.dataURL } });
        } else if (a.kind === 'pdf' && a.dataURL) {
          // Send PDFs via OpenRouter file blocks. `dataURL` should be a
          // data:application/pdf;base64,... string prepared before calling.
          blocks.push({
            type: 'file',
            file: {
              filename: a.name || 'document.pdf',
              file_data: a.dataURL,
            },
          });
        } else if (a.kind === 'audio') {
          // OpenRouter audio input uses base64 data + format (no data: prefix)
          const fmt: any =
            a.audioFormat ||
            (a.mime?.includes('wav') ? 'wav' : a.mime?.includes('mp3') ? 'mp3' : undefined);
          const fromDataUrl = (url?: string): string | undefined => {
            if (!url) return undefined;
            const idx = url.indexOf('base64,');
            if (idx >= 0) return url.slice(idx + 'base64,'.length);
            return undefined;
          };
          const base64 = a.base64 || fromDataUrl(a.dataURL);
          if (base64 && fmt) {
            blocks.push({
              type: 'input_audio',
              input_audio: {
                data: base64,
                format: fmt,
              },
            });
          }
        }
      }
      finalMsgs.push({ role: 'user', content: blocks });
    } else {
      // Include assistant annotations (from prior OpenRouter response) to skip PDF re-parsing
      if (k.role === 'assistant' && k.annotations) {
        finalMsgs.push({ role: k.role, content: k.content, annotations: k.annotations });
      } else {
        finalMsgs.push({ role: k.role, content: k.content });
      }
    }
  }
  return finalMsgs;
}
