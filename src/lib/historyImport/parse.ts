// Module: historyImport/parse
// Responsibility: Read the conversations.json of a ChatGPT or Claude data export into plain
// conversations: titles, times, and the user's and assistant's words along the branch shown.

import { asNumber, isRecord, readString, type UnknownRecord } from '@/lib/utils/guards';
import { t } from '@/lib/i18n';

export type HistorySource = 'chatgpt' | 'claude';

export const SOURCE_NAMES: Record<HistorySource, string> = { chatgpt: 'ChatGPT', claude: 'Claude' };

export type ImportedMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

export type ImportedConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ImportedMessage[];
};

/** A conversation read, one with nothing to bring in, or one that could not be read. */
export type ReadConversation = ImportedConversation | 'empty' | undefined;

/** Which export a parsed conversations.json came from, judged by its shape alone. */
export function detectHistorySource(data: unknown): HistorySource | undefined {
  if (!Array.isArray(data)) return undefined;
  for (const entry of data.slice(0, 50)) {
    if (!isRecord(entry)) continue;
    if (isRecord(entry.mapping)) return 'chatgpt';
    if (Array.isArray(entry.chat_messages)) return 'claude';
  }
  return undefined;
}

export function readConversation(source: HistorySource, raw: unknown): ReadConversation {
  return source === 'chatgpt' ? readChatGpt(raw) : readClaude(raw);
}

const text = (value: unknown) => readString(value)?.trim() || undefined;

const secondsToMs = (value: unknown) => {
  const seconds = asNumber(value);
  return seconds && seconds > 0 ? Math.round(seconds * 1000) : undefined;
};

const isoToMs = (value: unknown) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** A stable id for a conversation the export gave none: the same file gives the same id. */
const fallbackId = (seed: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `x${(hash >>> 0).toString(16)}`;
};

const imageNote = () => t('history.placeholder.image');
const fileNote = (name: string | undefined) =>
  name ? t('history.placeholder.file', { name }) : t('history.placeholder.fileUnnamed');

type Draft = { id: string; role: 'user' | 'assistant'; content: string; at?: number };

/**
 * Drops empty turns, joins a role's consecutive turns into one (a reply split
 * around a tool call, say), and keeps times strictly rising so the stored
 * order, which sorts by time, is the conversation's.
 */
function finish(
  drafts: Draft[],
  meta: { id: string; title?: string; createdAt?: number; updatedAt?: number },
): ReadConversation {
  const messages: ImportedMessage[] = [];
  let last = 0;
  for (const draft of drafts) {
    const content = draft.content.trim();
    if (!content) continue;
    const previous = messages[messages.length - 1];
    if (previous && previous.role === draft.role) {
      previous.content = `${previous.content}\n\n${content}`;
      continue;
    }
    const base = draft.at ?? meta.createdAt ?? last;
    const createdAt = Math.max(base, last + 1);
    last = createdAt;
    messages.push({ id: draft.id, role: draft.role, content, createdAt });
  }
  if (!messages.length) return 'empty';
  const createdAt = meta.createdAt ?? messages[0].createdAt;
  const lastAt = messages[messages.length - 1].createdAt;
  return {
    id: meta.id,
    title: meta.title ?? '',
    createdAt,
    updatedAt: Math.max(meta.updatedAt ?? 0, lastAt, createdAt),
    messages,
  };
}

// ChatGPT --------------------------------------------------------------------

// Newer exports wrap citations in private-use characters: citeturn0search3.
const CITATION_MARKER = /[^]*/g;

function readChatGpt(raw: unknown): ReadConversation {
  if (!isRecord(raw) || !isRecord(raw.mapping)) return undefined;
  const mapping = raw.mapping;
  const createdAt = secondsToMs(raw.create_time);
  const title = text(raw.title);
  const sourceId =
    text(raw.conversation_id) ?? text(raw.id) ?? fallbackId(`${title ?? ''}|${createdAt ?? ''}`);

  // The branch shown is the one ending at current_node; an export without it
  // gets the newest leaf.
  let nodeId = text(raw.current_node);
  if (!nodeId || !isRecord(mapping[nodeId])) nodeId = newestLeaf(mapping);
  const path: UnknownRecord[] = [];
  const seen = new Set<string>();
  while (nodeId && !seen.has(nodeId)) {
    seen.add(nodeId);
    const node = mapping[nodeId];
    if (!isRecord(node)) break;
    path.push(node);
    nodeId = text(node.parent);
  }
  path.reverse();

  const drafts: Draft[] = [];
  for (const node of path) {
    const draft = readChatGptMessage(node.message);
    if (draft) drafts.push(draft);
  }
  return finish(drafts, {
    id: `chatgpt-${sourceId}`,
    title,
    createdAt,
    updatedAt: secondsToMs(raw.update_time),
  });
}

function newestLeaf(mapping: UnknownRecord): string | undefined {
  let best: { id: string; at: number } | undefined;
  for (const [id, node] of Object.entries(mapping)) {
    if (!isRecord(node)) continue;
    if (Array.isArray(node.children) && node.children.length > 0) continue;
    const message = isRecord(node.message) ? node.message : undefined;
    const at = secondsToMs(message?.create_time) ?? 0;
    if (!best || at >= best.at) best = { id, at };
  }
  return best?.id;
}

function readChatGptMessage(message: unknown): Draft | undefined {
  if (!isRecord(message)) return undefined;
  const id = text(message.id);
  const author = isRecord(message.author) ? message.author : {};
  const role = author.role;
  if (!id || (role !== 'user' && role !== 'assistant')) return undefined;
  const metadata = isRecord(message.metadata) ? message.metadata : {};
  if (metadata.is_visually_hidden_from_conversation === true) return undefined;
  // An assistant message addressed to a tool is a tool call, not words to the person.
  const recipient = readString(message.recipient);
  if (role === 'assistant' && recipient && recipient !== 'all') return undefined;
  const content = isRecord(message.content) ? message.content : {};
  const kind = content.content_type;

  const pieces: string[] = [];
  let images = 0;
  if (kind === 'text' || kind === 'multimodal_text') {
    for (const part of Array.isArray(content.parts) ? content.parts : []) {
      if (typeof part === 'string') {
        pieces.push(part.replace(CITATION_MARKER, ''));
      } else if (isRecord(part)) {
        if (part.content_type === 'image_asset_pointer') images++;
        else if (part.content_type === 'audio_transcription' && typeof part.text === 'string')
          pieces.push(part.text);
      }
    }
  } else if (kind === 'code' && typeof content.text === 'string') {
    pieces.push(`\`\`\`${readString(content.language) ?? ''}\n${content.text}\n\`\`\``);
  } else {
    // Thoughts, tool output, browsing displays, custom instructions: not the conversation.
    return undefined;
  }

  // Attachments carry names, so they stand in for the bare image pointers when present.
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
  const notes = attachments.length
    ? attachments.map((entry) => {
        const name = isRecord(entry) ? text(entry.name) : undefined;
        const mime = isRecord(entry)
          ? (readString(entry.mime_type) ?? readString(entry.mimeType))
          : '';
        return mime?.startsWith('image/') && !name ? imageNote() : fileNote(name);
      })
    : Array.from({ length: images }, imageNote);

  return {
    id,
    role,
    content: [...notes, pieces.join('\n\n').trim()].filter(Boolean).join('\n\n'),
    at: secondsToMs(message.create_time),
  };
}

// Claude ---------------------------------------------------------------------

function readClaude(raw: unknown): ReadConversation {
  if (!isRecord(raw) || !Array.isArray(raw.chat_messages)) return undefined;
  const createdAt = isoToMs(raw.created_at);
  const title = text(raw.name);
  const sourceId = text(raw.uuid) ?? fallbackId(`${title ?? ''}|${createdAt ?? ''}`);
  const chatId = `claude-${sourceId}`;

  const drafts: Draft[] = [];
  claudeBranch(raw.chat_messages).forEach((message, index) => {
    const role =
      message.sender === 'human' ? 'user' : message.sender === 'assistant' ? 'assistant' : null;
    if (!role) return;
    drafts.push({
      id: text(message.uuid) ?? `${index}`,
      role,
      content: readClaudeContent(message),
      at: isoToMs(message.created_at),
    });
  });
  return finish(drafts, {
    id: chatId,
    title,
    createdAt,
    updatedAt: isoToMs(raw.updated_at),
  });
}

/**
 * The messages along the branch shown. Exports whose messages name their
 * parent may hold edited branches side by side; the newest message's line of
 * parents is the one kept. Without parents the list is already one line.
 */
function claudeBranch(list: unknown[]): UnknownRecord[] {
  const messages = list.filter(isRecord);
  const byId = new Map<string, UnknownRecord>();
  for (const message of messages) {
    const id = text(message.uuid);
    if (id) byId.set(id, message);
  }
  const hasParents = messages.some((m) => byId.has(readString(m.parent_message_uuid) ?? ''));
  if (!hasParents) return messages;

  let leaf: UnknownRecord | undefined;
  let leafAt = -Infinity;
  messages.forEach((message) => {
    const at = isoToMs(message.created_at) ?? -Infinity;
    if (at >= leafAt) {
      leaf = message;
      leafAt = at;
    }
  });
  const branch: UnknownRecord[] = [];
  const seen = new Set<UnknownRecord>();
  for (let node = leaf; node && !seen.has(node); ) {
    seen.add(node);
    branch.push(node);
    node = byId.get(readString(node.parent_message_uuid) ?? '');
  }
  return branch.reverse();
}

function readClaudeContent(message: UnknownRecord): string {
  const blocks = Array.isArray(message.content) ? message.content.filter(isRecord) : [];
  const textBlocks = blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => (block.text as string).trim())
    .filter(Boolean);
  // Tool calls, their results and thinking are not the conversation.
  const body = textBlocks.length ? textBlocks.join('\n\n') : (readString(message.text) ?? '');

  const files = [
    ...(Array.isArray(message.attachments) ? message.attachments : []),
    ...(Array.isArray(message.files) ? message.files : []),
  ];
  const notes = files.filter(isRecord).map((file) => {
    const name = text(file.file_name);
    return file.file_kind === 'image' && !name ? imageNote() : fileNote(name);
  });
  return [...notes, body.trim()].filter(Boolean).join('\n\n');
}
