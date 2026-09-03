import { useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { RowActionSheet } from '@/components/ui/RowActionSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MoveChatSheet } from '@/components/MoveChatSheet';
import { PencilSquareIcon, TrashIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import type { Chat, Folder } from '@/lib/types';
import { ChatRowView } from '@/components/sidebar/ChatRowView';

export interface ChatRowContainerProps {
  chat: Chat;
  depth?: number;
  collapsed?: boolean;
  isMobile?: boolean;
  isSelected: boolean;
  isEditing?: boolean;
  editTitle?: string;
  onSelect: () => void;
  onStartEdit?: () => void;
  onSaveEdit?: () => Promise<void> | void;
  onCancelEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  onEditTitleChange?: (value: string) => void;
  folders?: Folder[];
  moveChatToFolder?: (chatId: string, folderId?: string) => Promise<void> | void;
  onDragStart: (chatId: string) => void;
  onDragEnd: () => void;
}

export function ChatRowContainer({
  chat,
  depth = 0,
  collapsed = false,
  isMobile: isMobileProp,
  isSelected,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditTitleChange,
  folders: foldersProp,
  moveChatToFolder: moveChatToFolderProp,
  onDragStart,
  onDragEnd,
}: ChatRowContainerProps) {
  const { renameChat, deleteChat, moveChatToFolder, folders } = useChatStore(
    (state) => ({
      renameChat: state.renameChat,
      deleteChat: state.deleteChat,
      moveChatToFolder: state.moveChatToFolder,
      folders: state.folders,
    }),
    shallow,
  );
  const [localEditing, setLocalEditing] = useState(false);
  const [localEditTitle, setLocalEditTitle] = useState(chat.title);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const detectedMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const isMobile = isMobileProp ?? detectedMobile;

  const controlledEditing = typeof isEditing === 'boolean';
  const editing = controlledEditing ? isEditing : localEditing;
  const titleValue = editTitle ?? localEditTitle;
  const setTitle = onEditTitleChange ?? setLocalEditTitle;
  const resolvedFolders = foldersProp ?? folders;
  const resolvedMoveChat = moveChatToFolderProp ?? moveChatToFolder;

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete();
      return;
    }
    await deleteChat(chat.id);
  };

  useEffect(() => {
    if (!editing && !controlledEditing) {
      setLocalEditTitle(chat.title);
    }
  }, [chat.title, editing, controlledEditing]);

  const startEditing = () => {
    if (onStartEdit) {
      onStartEdit();
      return;
    }
    setLocalEditTitle(chat.title);
    setLocalEditing(true);
  };

  const cancelEditing = () => {
    if (onCancelEdit) {
      onCancelEdit();
      return;
    }
    setLocalEditing(false);
    setLocalEditTitle(chat.title);
  };

  const saveEditing = async () => {
    if (onSaveEdit) {
      await onSaveEdit();
      return;
    }
    const nextTitle = titleValue.trim();
    if (nextTitle && nextTitle !== chat.title) {
      await renameChat(chat.id, nextTitle);
    }
    setLocalEditing(false);
  };

  const longPress = useLongPressSheet({
    enabled: isMobile && !editing,
    onLongPress: () => setShowActions(true),
    onTap: () => {
      if (!editing) onSelect();
    },
  });

  return (
    <>
      <ChatRowView
        chatId={chat.id}
        title={chat.title}
        depth={depth}
        collapsed={collapsed}
        isMobile={isMobile}
        isSelected={isSelected}
        isEditing={editing}
        editTitle={titleValue}
        onSelect={onSelect}
        onStartEdit={startEditing}
        onSaveEdit={saveEditing}
        onCancelEdit={cancelEditing}
        onDelete={() => setShowConfirm(true)}
        onMove={() => setShowMoveSheet(true)}
        onEditTitleChange={setTitle}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onPointerDown={longPress.onPointerDown}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerCancel={longPress.onPointerCancel}
      />

      <RowActionSheet
        open={isMobile && showActions}
        label={`Actions for ${chat.title}`}
        onClose={() => setShowActions(false)}
      >
        <button
          className="mobile-menu-item"
          onClick={() => {
            setShowActions(false);
            startEditing();
          }}
          title="Rename chat"
        >
          <PencilSquareIcon className="h-4 w-4" />
          <span>Rename chat</span>
        </button>
        <button
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
      </RowActionSheet>

      <ConfirmDialog
        open={showConfirm}
        title="Delete chat?"
        description={`Delete chat "${chat.title}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          void handleDelete();
        }}
      />

      {resolvedFolders && (
        <MoveChatSheet
          open={showMoveSheet}
          chatTitle={chat.title}
          currentFolderId={chat.folderId}
          folders={resolvedFolders}
          onClose={() => setShowMoveSheet(false)}
          onMove={async (target) => {
            if (target === chat.folderId) {
              setShowMoveSheet(false);
              return;
            }
            await resolvedMoveChat(chat.id, target);
            setShowMoveSheet(false);
          }}
        />
      )}
    </>
  );
}
