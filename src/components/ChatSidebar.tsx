'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useDragAndDrop } from '@/lib/dragDrop';
import FolderItem from './FolderItem';
import IconButton from './IconButton';
import ThemeToggle from '@/components/ThemeToggle';
import ConfirmDialog from './ConfirmDialog';
import { MoveChatSheet } from '@/components/MoveChatSheet';
import {
  PlusIcon,
  FolderPlusIcon,
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import type { Chat, Folder } from '@/lib/types';
// Settings gear moved to the top header

export default function ChatSidebar() {
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
    }),
    shallow,
  );
  const collapsed = useChatStore((s) => s.ui.sidebarCollapsed ?? false);

  const { handleDragOver, handleDrop, handleDragStart, handleDragEnd, getDragData } =
    useDragAndDrop();
  // Settings button removed from sidebar header
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    update();
    window.addEventListener('resize', update, { passive: true } as any);
    return () => window.removeEventListener('resize', update as any);
  }, []);
  // no global swipe state; long-press opens action sheet per-row

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Get top-level folders and root-level chats
  const rootFolders = folders.filter((f) => !f.parentId);
  const rootChats = chats.filter((c) => !c.folderId);

  // Simple name matcher
  const match = (text?: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (text || '').toLowerCase().includes(q);
  };
  const folderMatches = (folderId: string): boolean => {
    const f = folders.find((x) => x.id === folderId);
    if (!f) return false;
    if (match(f.name)) return true;
    const subFolders = folders.filter((x) => x.parentId === folderId);
    const hasChat = chats.some((c) => c.folderId === folderId && match(c.title));
    return hasChat || subFolders.some((sf) => folderMatches(sf.id));
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowCreateFolder(false);
    }
  };

  // Fill the aside; width is controlled by grid column in `app-shell`
  return (
    <div className={'h-full flex flex-col w-full'}>
      <div className="app-header justify-between">
        <div className="flex items-center gap-2 font-semibold">{collapsed ? 'Dg' : 'Dialogia'}</div>
        <div className="flex items-center gap-2">
          <IconButton
            onClick={() => newChat()}
            title="New Chat"
            variant="ghost"
            className="w-11 h-11 sm:w-9 sm:h-9"
          >
            <PlusIcon className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
          </IconButton>
          {!collapsed && (
            <IconButton
              onClick={() => setShowCreateFolder(true)}
              title="Create folder"
              variant="ghost"
              className="w-11 h-11 sm:w-9 sm:h-9"
            >
              <FolderPlusIcon className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
            </IconButton>
          )}
          {/* Mobile-only: theme, settings, close sidebar */}
          <span className="sm:hidden flex items-center gap-2">
            <ThemeToggle />
            <IconButton
              onClick={() => {
                const isSmall = typeof window !== 'undefined' && window.innerWidth < 768;
                useChatStore
                  .getState()
                  .setUI({ showSettings: true, ...(isSmall ? { sidebarCollapsed: true } : {}) });
              }}
              title="Settings"
              variant="ghost"
              className="w-11 h-11"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </IconButton>
            <IconButton
              onClick={() => useChatStore.getState().setUI({ sidebarCollapsed: true })}
              title="Close sidebar"
              variant="ghost"
              className="w-11 h-11"
            >
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </span>
        </div>
      </div>

      {/* Create folder input */}
      {showCreateFolder && !collapsed && (
        <div className="sidebar-section pb-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-base sm:text-sm"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  setShowCreateFolder(false);
                  setNewFolderName('');
                }
              }}
              autoFocus
            />
            <IconButton size="sm" onClick={handleCreateFolder} title="Create folder">
              <CheckIcon className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              size="sm"
              onClick={() => {
                setShowCreateFolder(false);
                setNewFolderName('');
              }}
              title="Cancel"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      )}

      {/* Search */}
      {!collapsed && (
        <div className="sidebar-section pb-2">
          <input
            className="input w-full text-base sm:text-sm"
            placeholder="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {!collapsed && (
        <div className="sidebar-section text-xs text-muted-foreground font-medium uppercase tracking-wider pb-2">
          Chats
        </div>
      )}

      {/* Drop zone for root level */}
      <div
        className={`scroll-area flex-1 sidebar-section`}
        onDragOver={handleDragOver}
        onDrop={async (e) => {
          e.preventDefault();
          const dragData = getDragData();
          if (dragData && dragData.type === 'chat') {
            await handleDrop(undefined);
          }
        }}
      >
        {/* Root folders */}
        {rootFolders
          .filter((folder) => (query ? folderMatches(folder.id) : true))
          .map((folder) => (
            <FolderItem key={folder.id} folder={folder} />
          ))}

        {/* Root chats */}
        {rootChats
          .filter((chat) => (query ? match(chat.title) : true))
          .map((chat) => (
            <RootChatItem
              key={chat.id}
              chat={chat}
              collapsed={collapsed}
              isMobile={isMobile}
              isSelected={selectedChatId === chat.id}
              isEditing={editingId === chat.id}
              editTitle={editTitle}
              onSelect={() => selectChat(chat.id)}
              onStartEdit={() => {
                setEditingId(chat.id);
                setEditTitle(chat.title);
              }}
              onSaveEdit={async () => {
                await renameChat(chat.id, editTitle || chat.title);
                setEditingId(null);
              }}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => deleteChat(chat.id)}
              onEditTitleChange={setEditTitle}
              folders={folders}
              moveChatToFolder={moveChatToFolder}
              onDragStart={(id) => handleDragStart(id, 'chat')}
              onDragEnd={handleDragEnd}
            />
          ))}
      </div>
      {/* Per-item delete confirmation handled inside RootChatItem */}
    </div>
  );
}

// Component for root-level chats (outside folders)
interface RootChatItemProps {
  chat: Chat;
  collapsed: boolean;
  isMobile: boolean;
  isSelected: boolean;
  isEditing: boolean;
  editTitle: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditTitleChange: (title: string) => void;
  folders: Folder[];
  moveChatToFolder: (chatId: string, folderId?: string) => Promise<void>;
  onDragStart: (chatId: string) => void;
  onDragEnd: () => void;
}

function RootChatItem({
  chat,
  collapsed,
  isMobile,
  isSelected,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditTitleChange,
  folders,
  moveChatToFolder,
  onDragStart,
  onDragEnd,
}: RootChatItemProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  // Long-press detection (mobile)
  const startX = useRef(0);
  const startY = useRef(0);
  const longTid = useRef<number | null>(null);
  const longFired = useRef(false);
  const slop = 8;

  const clearLong = () => {
    if (longTid.current) window.clearTimeout(longTid.current);
    longTid.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isMobile || isEditing) return;
    if (e.pointerType === 'mouse') return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    longFired.current = false;
    clearLong();
    longTid.current = window.setTimeout(() => {
      longFired.current = true;
      setShowActions(true);
    }, 500);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isMobile || isEditing) return;
    const dxNow = e.clientX - startX.current;
    const dyNow = e.clientY - startY.current;
    if (Math.abs(dxNow) > slop || Math.abs(dyNow) > slop) {
      clearLong();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!isMobile || isEditing) return;
    const moved =
      Math.abs(e.clientX - startX.current) > slop || Math.abs(e.clientY - startY.current) > slop;
    if (!longFired.current && !moved) onSelect();
    clearLong();
  };
  const onPointerCancel = () => {
    clearLong();
  };

  return (
    <>
      <div className="pb-1" data-row-press>
        <div className="relative">
          <div
            className={`flex items-center gap-2 px-4 py-3 sm:py-2 cursor-pointer group chat-item ${
              isSelected ? 'selected' : ''
            }`}
            draggable={!isMobile}
            onDragStart={() => {
              if (isMobile) return;
              onDragStart(chat.id);
            }}
            onDragEnd={onDragEnd}
            onClick={!isEditing ? onSelect : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {/* Chat Icon */}
            <div className="w-6 h-6 sm:w-4 sm:h-4 flex items-center justify-center text-muted-foreground">
              <ChatBubbleLeftRightIcon className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
            </div>

            {/* Chat Title */}
            {isEditing ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  className="input flex-1 text-base sm:text-sm"
                  value={editTitle}
                  onChange={(e) => onEditTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSaveEdit();
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                  onBlur={onSaveEdit}
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex-1 text-base sm:text-sm truncate">
                {collapsed ? '' : chat.title}
              </div>
            )}

            {/* Desktop action icons only (hide on mobile) */}
            {!isEditing && !collapsed && (
              <div className="hidden sm:flex opacity-0 sm:group-hover:opacity-100 transition-opacity gap-1">
                <IconButton
                  size="sm"
                  onClick={(e) => {
                    e?.stopPropagation();
                    onStartEdit();
                  }}
                  title="Rename chat"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={(e) => {
                    e?.stopPropagation();
                    setShowMoveSheet(true);
                  }}
                  title="Move to folder"
                >
                  <FolderOpenIcon className="h-4 w-4" />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={(e) => {
                    e?.stopPropagation();
                    setShowConfirm(true);
                  }}
                  title="Delete chat"
                >
                  <TrashIcon className="h-4 w-4" />
                </IconButton>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMobile &&
        showActions &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="mobile-sheet-overlay"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowActions(false);
            }}
          >
            <div
              className="mobile-sheet card mobile-sheet-compact"
              role="menu"
              aria-label={`Actions for ${chat.title}`}
            >
              <div className="mobile-sheet-handle" aria-hidden="true" />
              <button
                type="button"
                className="mobile-menu-item"
                onClick={() => {
                  setShowActions(false);
                  onStartEdit();
                }}
                title="Rename chat"
              >
                <PencilSquareIcon className="h-4 w-4" />
                <span>Rename chat</span>
              </button>
              <button
                type="button"
                className="mobile-menu-item"
                onClick={() => {
                  setShowActions(false);
                  setShowMoveSheet(true);
                }}
                title="Move chat to folder"
              >
                <FolderOpenIcon className="h-4 w-4" />
                <span>Move to folder</span>
              </button>
              <button
                type="button"
                className="mobile-menu-item is-danger"
                onClick={() => {
                  setShowActions(false);
                  setShowConfirm(true);
                }}
                title="Delete chat"
              >
                <TrashIcon className="h-4 w-4" />
                <span>Delete chat</span>
              </button>
            </div>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={showConfirm}
        title="Delete chat?"
        description={`Delete chat "${chat.title}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          onDelete();
        }}
      />

      <MoveChatSheet
        open={showMoveSheet}
        chatTitle={chat.title}
        currentFolderId={chat.folderId}
        folders={folders}
        onClose={() => setShowMoveSheet(false)}
        onMove={async (target) => {
          if (target === chat.folderId) {
            setShowMoveSheet(false);
            return;
          }
          await moveChatToFolder(chat.id, target);
          setShowMoveSheet(false);
        }}
      />
    </>
  );
}
