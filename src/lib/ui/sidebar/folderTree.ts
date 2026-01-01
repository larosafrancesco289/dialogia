import type { Chat, Folder } from '@/lib/types';

export type FolderChildren = {
  chats: Chat[];
  folders: Folder[];
};

export function getFolderChildren(
  folders: Folder[],
  chats: Chat[],
  folderId: string,
): FolderChildren {
  return {
    chats: chats.filter((chat) => chat.folderId === folderId),
    folders: folders.filter((folder) => folder.parentId === folderId),
  };
}
