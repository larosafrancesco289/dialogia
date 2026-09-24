import type { Chat, Folder } from '@/lib/types';

export type FolderChildren = {
  chats: Chat[];
  folders: Folder[];
};

const ROOT_KEY = '__root__';
const EMPTY_CHATS: Chat[] = [];
const EMPTY_FOLDERS: Folder[] = [];

export type FolderTreeIndex = {
  chatsByFolderId: ReadonlyMap<string, Chat[]>;
  foldersByParentId: ReadonlyMap<string, Folder[]>;
};

const toKey = (id?: string) => id ?? ROOT_KEY;

const compareByRecency = (
  a: { id: string; updatedAt?: number; createdAt?: number },
  b: { id: string; updatedAt?: number; createdAt?: number },
) => {
  const aUpdated = a.updatedAt ?? a.createdAt ?? 0;
  const bUpdated = b.updatedAt ?? b.createdAt ?? 0;
  if (aUpdated !== bUpdated) return bUpdated - aUpdated;
  const aCreated = a.createdAt ?? 0;
  const bCreated = b.createdAt ?? 0;
  if (aCreated !== bCreated) return bCreated - aCreated;
  return a.id.localeCompare(b.id);
};

const compareByName = (a: Folder, b: Folder) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) ||
  a.createdAt - b.createdAt;

export function buildFolderTreeIndex(folders: Folder[], chats: Chat[]): FolderTreeIndex {
  const chatsByFolderId = new Map<string, Chat[]>();
  for (const chat of chats) {
    const key = toKey(chat.folderId);
    const list = chatsByFolderId.get(key);
    if (list) list.push(chat);
    else chatsByFolderId.set(key, [chat]);
  }
  for (const [key, list] of chatsByFolderId.entries()) {
    chatsByFolderId.set(key, [...list].sort(compareByRecency));
  }

  const foldersByParentId = new Map<string, Folder[]>();
  for (const folder of folders) {
    const key = toKey(folder.parentId);
    const list = foldersByParentId.get(key);
    if (list) list.push(folder);
    else foldersByParentId.set(key, [folder]);
  }
  // Folders read like an index: by name, the same order as the move menu, and
  // the same after a reload (storage returns them in random-id order).
  for (const [key, list] of foldersByParentId.entries()) {
    foldersByParentId.set(key, [...list].sort(compareByName));
  }

  return {
    chatsByFolderId,
    foldersByParentId,
  };
}

export function getFolderChildren(index: FolderTreeIndex, folderId?: string): FolderChildren {
  const key = toKey(folderId);
  return {
    chats: index.chatsByFolderId.get(key) ?? EMPTY_CHATS,
    folders: index.foldersByParentId.get(key) ?? EMPTY_FOLDERS,
  };
}
