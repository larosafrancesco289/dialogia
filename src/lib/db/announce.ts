// Module: db/announce
// Responsibility: Tell the other tabs about every write that has reached the database.
// Wrapping the repository is what covers every write path: nothing else needs to
// remember to announce, and a write that fails announces nothing.

import type { Repository } from '@/lib/db/repository';
import type { TabAnnouncement } from '@/lib/sync/tabChannel';
import type { Message } from '@/lib/types';

const messagesByChat = (messages: Message[]): TabAnnouncement[] => {
  const ids = new Map<string, string[]>();
  for (const message of messages) {
    const list = ids.get(message.chatId) ?? [];
    list.push(message.id);
    ids.set(message.chatId, list);
  }
  return [...ids].map(([chatId, list]) => ({ kind: 'messages', chatId, ids: list }));
};

export function announceWrites(
  repository: Repository,
  post: (announcement: TabAnnouncement) => void,
): Repository {
  const announce = (...announcements: TabAnnouncement[]) => announcements.forEach(post);
  return {
    ...repository,
    async saveChat(chat) {
      await repository.saveChat(chat);
      announce({ kind: 'chats', ids: [chat.id] });
    },
    async saveMessage(message) {
      await repository.saveMessage(message);
      announce(...messagesByChat([message]));
    },
    async saveMessages(messages) {
      await repository.saveMessages(messages);
      announce(...messagesByChat(messages));
    },
    async saveFolder(folder) {
      await repository.saveFolder(folder);
      announce({ kind: 'folders', ids: [folder.id] });
    },
    async saveChatWithMessages(chat, messages) {
      await repository.saveChatWithMessages(chat, messages);
      announce({ kind: 'chats', ids: [chat.id] }, ...messagesByChat(messages));
    },
    async deleteChatAndMessages(chatId) {
      await repository.deleteChatAndMessages(chatId);
      announce({ kind: 'chatDeleted', id: chatId });
    },
    async deleteFolder(folderId) {
      await repository.deleteFolder(folderId);
      announce({ kind: 'folderDeleted', id: folderId });
    },
    async importAll(data) {
      await repository.importAll(data);
      announce({ kind: 'replaced' });
    },
    async appendTutorEvents(events) {
      await repository.appendTutorEvents(events);
      const chatIds = new Set(events.map((event) => event.chatId));
      announce(...[...chatIds].map((chatId) => ({ kind: 'tutorEvents' as const, chatId })));
    },
    async seedTutorEvents(chatId, events) {
      const seeded = await repository.seedTutorEvents(chatId, events);
      if (seeded) announce({ kind: 'tutorEvents', chatId });
      return seeded;
    },
    async deleteTutorEvents(chatId) {
      await repository.deleteTutorEvents(chatId);
      announce({ kind: 'tutorEvents', chatId });
    },
  };
}
