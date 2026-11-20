// Module: ui/chatSearch
// Responsibility: Pure full-text search ranking and plain-text excerpt building
// for the quick search dialog across chats and persisted messages.

import type { Chat } from '@/lib/types';
import type { MessageSearchRecord } from '@/lib/db/repository';
import { markdownToPlainText } from '@/lib/markdown/plainText';
import { displayChatTitle } from '@/lib/ui/chatTitle';
import { compareByRecency } from '@/lib/ui/sidebar/folderTree';

export type MessageSearchHit = {
  chatId: string;
  chatTitle: string;
  isTutor: boolean;
  messageId: string;
  role: MessageSearchRecord['role'];
  createdAt: number;
  excerpt: string;
};

/** Distinct lowercase search words from the user's input. */
export function tokenizeQuery(query: string): string[] {
  return Array.from(new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean)));
}

/**
 * Chats matching every word in `query`, ordered by recency. An empty query
 * returns the most recent chats so quick search doubles as a chat switcher.
 */
export function searchChats(chats: Chat[], query: string, limit = 8): Chat[] {
  const sorted = [...chats].sort(compareByRecency);
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return sorted.slice(0, limit);
  const matched: Chat[] = [];
  for (const chat of sorted) {
    const title = displayChatTitle(chat.title).toLowerCase();
    if (terms.every((term) => title.includes(term))) {
      matched.push(chat);
      if (matched.length >= limit) break;
    }
  }
  return matched;
}

/**
 * A single-line plain-text excerpt centred around the earliest match of any
 * search term, trimmed to word boundaries with ellipses where cut.
 */
export function buildMessageExcerpt(markdown: string, terms: string[], maxLen = 120): string {
  const plain = markdownToPlainText(markdown).replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  if (plain.length <= maxLen) return plain;

  const lower = plain.toLowerCase();
  let firstHit = -1;
  for (const term of terms) {
    if (!term) continue;
    const at = lower.indexOf(term);
    if (at !== -1 && (firstHit === -1 || at < firstHit)) firstHit = at;
  }

  let start = 0;
  if (firstHit > Math.floor(maxLen * 0.35)) {
    start = Math.max(0, firstHit - Math.floor(maxLen * 0.3));
    const nextSpace = plain.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace < firstHit) start = nextSpace + 1;
  }

  let end = Math.min(plain.length, start + maxLen);
  if (end < plain.length) {
    const lastSpace = plain.lastIndexOf(' ', end);
    if (lastSpace > start + Math.floor(maxLen * 0.5)) end = lastSpace;
  }

  const slice = plain.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${slice}${end < plain.length ? '…' : ''}`;
}

/**
 * Joins raw message search hits with the live chat list, caps hits per chat so
 * one long thread cannot crowd out the rest, and builds plain-text excerpts.
 */
export function buildMessageHits(
  records: MessageSearchRecord[],
  chats: Chat[],
  query: string,
  opts?: { maxTotal?: number; maxPerChat?: number },
): MessageSearchHit[] {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  const maxTotal = opts?.maxTotal ?? 20;
  const maxPerChat = opts?.maxPerChat ?? 2;
  const chatById = new Map(chats.map((chat) => [chat.id, chat]));
  const perChat = new Map<string, number>();
  const seenIds = new Set<string>();
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt);
  const hits: MessageSearchHit[] = [];

  for (const record of sorted) {
    if (seenIds.has(record.id)) continue;
    seenIds.add(record.id);
    const chat = chatById.get(record.chatId);
    if (!chat) continue;
    const count = perChat.get(record.chatId) ?? 0;
    if (count >= maxPerChat) continue;
    const excerpt = buildMessageExcerpt(record.content, terms);
    if (!excerpt) continue;
    perChat.set(record.chatId, count + 1);
    hits.push({
      chatId: record.chatId,
      chatTitle: displayChatTitle(chat.title),
      isTutor: chat.settings.features.tutor?.enabled === true,
      messageId: record.id,
      role: record.role,
      createdAt: record.createdAt,
      excerpt,
    });
    if (hits.length >= maxTotal) break;
  }
  return hits;
}
