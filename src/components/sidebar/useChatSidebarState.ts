import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useDragAndDrop } from '@/lib/dragDrop';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import type { Chat, Folder } from '@/lib/types';

type ChatSidebarStateInput = {
  collapsed?: boolean;
};

export type ChatSidebarState = {
  collapsed: boolean;
  query: string;
  showCreateFolder: boolean;
  newFolderName: string;
  editTitle: string;
  editingId: string | null;
  filteredRootFolders: Folder[];
  filteredRootChats: Chat[];
  folders: Folder[];
  selectedChatId?: string;
  isMobile: boolean;
  onQueryChange: (value: string) => void;
  onNewFolderNameChange: (value: string) => void;
  onStartCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  onCreateFolder: () => Promise<void>;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onCloseSidebar: () => void;
  onSelectChat: (chatId: string) => void;
  onStartEditChat: (chatId: string, title: string) => void;
  onSaveEditChat: (chatId: string, fallbackTitle: string) => Promise<void>;
  onCancelEditChat: () => void;
  onDeleteChat: (chatId: string) => Promise<void>;
  onEditTitleChange: (value: string) => void;
  moveChatToFolder: (chatId: string, folderId?: string) => Promise<void>;
  handleDragStart: (id: string, type: 'folder' | 'chat') => void;
  handleDragEnd: () => void;
  handleDragOver: (event: DragEvent) => void;
  handleRootDrop: (event: DragEvent) => Promise<void>;
};

export function useChatSidebarState({
  collapsed: collapsedProp,
}: ChatSidebarStateInput = {}): ChatSidebarState {
  const {
    chats,
    folders,
    selectedChatId,
    selectChat,
    newChat,
    renameChat,
    deleteChat,
    loadModels,
    createFolder,
    moveChatToFolder,
    collapsedFromStore,
    setUI,
  } = useChatStore(
    (s) => ({
      chats: s.chats,
      folders: s.folders,
      selectedChatId: s.selectedChatId,
      selectChat: s.selectChat,
      newChat: s.newChat,
      renameChat: s.renameChat,
      deleteChat: s.deleteChat,
      loadModels: s.loadModels,
      createFolder: s.createFolder,
      moveChatToFolder: s.moveChatToFolder,
      collapsedFromStore: s.ui.sidebarCollapsed ?? false,
      setUI: s.setUI,
    }),
    shallow,
  );

  const collapsed = collapsedProp ?? collapsedFromStore;
  const { handleDragOver, handleDrop, handleDragStart, handleDragEnd, getDragData } =
    useDragAndDrop();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [query, setQuery] = useState('');
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const isTablet = useMediaQuery(MEDIA_QUERIES.tablet);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const rootFolders = useMemo(() => folders.filter((f) => !f.parentId), [folders]);
  const rootChats = useMemo(() => chats.filter((c) => !c.folderId), [chats]);
  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const childFoldersById = useMemo(() => {
    const map = new Map<string, Folder[]>();
    for (const folder of folders) {
      if (!folder.parentId) continue;
      const list = map.get(folder.parentId);
      if (list) list.push(folder);
      else map.set(folder.parentId, [folder]);
    }
    return map;
  }, [folders]);
  const chatsByFolderId = useMemo(() => {
    const map = new Map<string, Chat[]>();
    for (const chat of chats) {
      if (!chat.folderId) continue;
      const list = map.get(chat.folderId);
      if (list) list.push(chat);
      else map.set(chat.folderId, [chat]);
    }
    return map;
  }, [chats]);

  const filteredRootFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rootFolders;
    const matchText = (text?: string) => (text || '').toLowerCase().includes(q);
    const folderMatchCache = new Map<string, boolean>();
    const folderMatches = (folderId: string): boolean => {
      const cached = folderMatchCache.get(folderId);
      if (typeof cached === 'boolean') return cached;
      const folder = folderById.get(folderId);
      if (!folder) {
        folderMatchCache.set(folderId, false);
        return false;
      }
      if (matchText(folder.name)) {
        folderMatchCache.set(folderId, true);
        return true;
      }
      const subFolders = childFoldersById.get(folderId) ?? [];
      const hasChat = (chatsByFolderId.get(folderId) ?? []).some((c) => matchText(c.title));
      const matches = hasChat || subFolders.some((sf) => folderMatches(sf.id));
      folderMatchCache.set(folderId, matches);
      return matches;
    };
    return rootFolders.filter((folder) => folderMatches(folder.id));
  }, [query, rootFolders, folderById, childFoldersById, chatsByFolderId]);

  const filteredRootChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rootChats;
    const matchText = (text?: string) => (text || '').toLowerCase().includes(q);
    return rootChats.filter((chat) => matchText(chat.title));
  }, [query, rootChats]);

  const onCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await createFolder(trimmed);
    setNewFolderName('');
    setShowCreateFolder(false);
  }, [createFolder, newFolderName]);

  const onCancelCreateFolder = useCallback(() => {
    setShowCreateFolder(false);
    setNewFolderName('');
  }, []);

  const onStartCreateFolder = useCallback(() => {
    setShowCreateFolder(true);
  }, []);

  const onNewChat = useCallback(() => {
    void newChat();
  }, [newChat]);

  const onOpenSettings = useCallback(() => {
    setUI({ showSettings: true, ...(isTablet ? { sidebarCollapsed: true } : {}) });
  }, [setUI, isTablet]);

  const onCloseSidebar = useCallback(() => {
    setUI({ sidebarCollapsed: true });
  }, [setUI]);

  const onSelectChat = useCallback(
    (chatId: string) => {
      selectChat(chatId);
    },
    [selectChat],
  );

  const onStartEditChat = useCallback((chatId: string, title: string) => {
    setEditingId(chatId);
    setEditTitle(title);
  }, []);

  const onSaveEditChat = useCallback(
    async (chatId: string, fallbackTitle: string) => {
      await renameChat(chatId, editTitle || fallbackTitle);
      setEditingId(null);
    },
    [renameChat, editTitle],
  );

  const onCancelEditChat = useCallback(() => {
    setEditingId(null);
  }, []);

  const onDeleteChat = useCallback(
    async (chatId: string) => {
      await deleteChat(chatId);
    },
    [deleteChat],
  );

  const handleRootDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      const dragData = getDragData();
      if (dragData && dragData.type === 'chat') {
        await handleDrop(undefined);
      }
    },
    [getDragData, handleDrop],
  );

  return {
    collapsed,
    query,
    showCreateFolder,
    newFolderName,
    editTitle,
    editingId,
    filteredRootFolders,
    filteredRootChats,
    folders,
    selectedChatId,
    isMobile,
    onQueryChange: setQuery,
    onNewFolderNameChange: setNewFolderName,
    onStartCreateFolder,
    onCancelCreateFolder,
    onCreateFolder,
    onNewChat,
    onOpenSettings,
    onCloseSidebar,
    onSelectChat,
    onStartEditChat,
    onSaveEditChat,
    onCancelEditChat,
    onDeleteChat,
    onEditTitleChange: setEditTitle,
    moveChatToFolder,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleRootDrop,
  };
}
