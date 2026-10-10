// Module: historyImport/importHistory
// Responsibility: Bring a ChatGPT or Claude export's conversations in as chats, in batches
// through the repository's import (so the other tabs hear of it), into one folder per source.

import { repository } from '@/lib/db';
import { useChatStore } from '@/lib/store';
import { ChatService, DEFAULT_CHAT_TITLE } from '@/lib/services/chatService';
import {
  readConversation,
  SOURCE_NAMES,
  type HistorySource,
  type ImportedConversation,
} from '@/lib/historyImport/parse';
import type { Chat, Folder, Message } from '@/lib/types';
import { err, ok, type Result } from '@/lib/utils/result';
import { t } from '@/lib/i18n';

export type ImportProgress = { source: HistorySource; done: number; total: number };

/** @internal Batches are cut at whichever comes first. */
export const BATCH_LIMITS = { chats: 100, messages: 3000 };

/** The folder every chat from one source lands in, the same one on every import. */
export const importFolderId = (source: HistorySource) => `import-${source}`;

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function importedChatSettings(): Chat['settings'] {
  const { ui, chats, selectedChatId, models } = useChatStore.getState();
  const settings = ChatService.buildSettingsForNewChat({ ui, chats, selectedChatId, models });
  // Brought-in chats are conversations, never learning sessions.
  const tutor = settings.features.tutor;
  if (tutor?.enabled) settings.features.tutor = { ...tutor, enabled: false };
  return settings;
}

const toMessages = (conversation: ImportedConversation): Message[] =>
  conversation.messages.map((message) => ({
    id: `${conversation.id}-${message.id}`,
    chatId: conversation.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }));

/**
 * A chat brought in before keeps what was done to it here (its title,
 * folder, settings) and takes the export's messages again by id, so a second
 * import of the same file, or a newer one, doubles nothing.
 */
export async function importHistory(
  source: HistorySource,
  entries: unknown[],
  onProgress?: (progress: ImportProgress) => void,
): Promise<Result<{ notice: string }, string>> {
  const settings = importedChatSettings();
  const folderId = importFolderId(source);
  const sourceName = SOURCE_NAMES[source];
  const [folder] = await repository.loadFolders([folderId]);
  // Named once; a rename here is kept, and the notice uses it.
  const folderName = folder?.name ?? t('history.folder', { source: sourceName });
  let folderExists = !!folder;
  let imported = 0;
  let skipped = 0;
  let index = 0;
  onProgress?.({ source, done: 0, total: entries.length });

  while (index < entries.length) {
    const batch: ImportedConversation[] = [];
    let messageCount = 0;
    while (
      index < entries.length &&
      batch.length < BATCH_LIMITS.chats &&
      messageCount < BATCH_LIMITS.messages
    ) {
      const read = readConversation(source, entries[index++]);
      if (read === undefined) skipped++;
      if (!read || read === 'empty') continue;
      batch.push(read);
      messageCount += read.messages.length;
    }

    if (batch.length) {
      const existing = new Map(
        (await repository.loadChats(batch.map((c) => c.id))).map((chat) => [chat.id, chat]),
      );
      const chats: Chat[] = batch.map((conversation) => {
        const before = existing.get(conversation.id);
        if (before)
          return { ...before, updatedAt: Math.max(before.updatedAt, conversation.updatedAt) };
        return {
          id: conversation.id,
          title: conversation.title || DEFAULT_CHAT_TITLE,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          settings,
          folderId,
        };
      });
      const needsFolder: boolean =
        !folderExists && chats.some((chat) => chat.folderId === folderId);
      const now = Date.now();
      const folders: Folder[] = needsFolder
        ? [
            {
              id: folderId,
              name: folderName,
              createdAt: now,
              updatedAt: now,
              isExpanded: false,
            },
          ]
        : [];
      const counts = await repository.importAll({
        chats,
        messages: batch.flatMap(toMessages),
        folders,
      });
      folderExists ||= needsFolder;
      imported += counts.chats;
      skipped += counts.skippedChats;
    }
    onProgress?.({ source, done: index, total: entries.length });
    // A large export is thousands of chats: let the page breathe between batches.
    await yieldToBrowser();
  }

  if (imported === 0) {
    return err(skipped ? t('data.noneRead') : t('history.nothing', { source: sourceName }));
  }
  const notice = t('history.imported', {
    count: imported,
    source: sourceName,
    folder: folderName,
  });
  return ok({
    notice: skipped ? `${notice} ${t('data.skipped.some', { count: skipped })}` : notice,
  });
}
