// Module: settings/chatMarkdown
// Responsibility: Format a single conversation as clean Markdown for export.

import { repository } from '@/lib/db';
import { formatModelLabel } from '@/lib/models';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import { displayChatTitle } from '@/lib/ui/chatTitle';
import { resolveMessageSources } from '@/lib/ui/messageSources';
import { t } from '@/lib/i18n';
import { formatDate, formatList } from '@/lib/i18n/format';

/** Safe `.md` filename derived from a chat title. */
export function buildChatMarkdownFilename(title: string): string {
  const cleaned = displayChatTitle(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 64)
    .replace(/-+$/g, '')
    .toLowerCase();
  return `${cleaned || 'chat'}.md`;
}

const isVisibleMarkdownMessage = (msg: Message): boolean =>
  !(msg.role === 'user' && msg.metadata?.hiddenFromUser) &&
  (msg.content.trim().length > 0 || (msg.attachments?.length ?? 0) > 0);

/** Allow only http(s) links in exported Markdown so untrusted schemes cannot become clickable. */
function safeHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/([\\[\]])/g, '\\$1');
}

/**
 * Turns a chat and its messages into a readable Markdown document: title,
 * date, each turn headed by speaker or model name, attachment notes, and any
 * sources a reply cited.
 */
export function formatChatAsMarkdown({
  chat,
  messages,
  models = [],
}: {
  chat: Chat;
  messages: Message[];
  models?: ModelDescriptor[];
}): string {
  const title = displayChatTitle(chat.title).replace(/[\r\n]+/g, ' ');
  const date = formatDate(chat.updatedAt ?? chat.createdAt, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const sections: string[] = [`# ${title}\n\n_${date}_`];

  const visible = messages.filter(isVisibleMarkdownMessage);

  for (const msg of visible) {
    const modelId = msg.model || chat.settings.modelId;
    const model = models.find((entry) => entry.id === modelId);
    const heading =
      msg.role === 'user'
        ? t('export.you')
        : modelId
          ? formatModelLabel({ model, fallbackId: modelId })
          : t('export.assistant');

    const parts: string[] = [`## ${heading}`];

    if (msg.attachments?.length) {
      const names = msg.attachments.map((att) => att.name || att.kind);
      parts.push(`_${t('export.attached', { files: formatList(names) })}_`);
    }

    const body = msg.content.trim();
    if (body) parts.push(body);

    const sources = resolveMessageSources({
      searchSources: msg.searchSources,
      annotations: msg.annotations,
    })
      ?.results?.map((entry) => {
        const href = entry.url ? safeHttpUrl(entry.url) : null;
        return href ? { url: href, title: entry.title } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (sources?.length) {
      const lines = sources.map(
        (source, index) =>
          `${index + 1}. [${escapeMarkdownLinkText(source.title || source.url)}](<${source.url}>)`,
      );
      parts.push(`**${t('export.sources')}**\n\n${lines.join('\n')}`);
    }

    sections.push(parts.join('\n\n'));
  }

  return `${sections.join('\n\n---\n\n')}\n`;
}

/**
 * Loads one chat directly from the database (preserving lazy hydration) and
 * returns its Markdown download payload, or null when the chat has no messages.
 */
export async function buildSingleChatMarkdownExport(
  chatId: string,
  models: ModelDescriptor[],
): Promise<{ filename: string; blob: Blob } | null> {
  const { chat, messages } = await repository.getChatWithMessages(chatId);
  if (!chat) return null;
  if (!messages.some(isVisibleMarkdownMessage)) return null;
  const markdown = formatChatAsMarkdown({ chat, messages, models });
  return {
    filename: buildChatMarkdownFilename(chat.title),
    blob: new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  };
}

/** Triggers a browser download for a generated Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so Safari finishes reading the blob URL before it is freed.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
