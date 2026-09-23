import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { RowActionSheet } from '@/components/ui/RowActionSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MoveChatSheet } from '@/components/MoveChatSheet';
import { PencilSquareIcon, TrashIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import type { Chat } from '@/lib/types';
import { MoveChatMenu } from '@/components/sidebar/MoveChatMenu';
import { ChatRowView } from '@/components/sidebar/ChatRowView';

export interface ChatRowContainerProps {
  chat: Chat;
  depth?: number;
  collapsed?: boolean;
  isMobile?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (chatId: string) => void;
  onDragEnd: () => void;
}

export function ChatRowContainer({
  chat,
  depth = 0,
  collapsed = false,
  isMobile: isMobileProp,
  isSelected,
  onSelect,
  onDragStart,
  onDragEnd,
}: ChatRowContainerProps) {
  const { renameChat, deleteChat, moveChatToFolder, createFolder, folders } = useChatStore(
    (state) => ({
      renameChat: state.renameChat,
      deleteChat: state.deleteChat,
      moveChatToFolder: state.moveChatToFolder,
      createFolder: state.createFolder,
      folders: state.folders,
    }),
    shallow,
  );
  const [editing, setEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const [moveAnchor, setMoveAnchor] = useState<DOMRect | null>(null);
  const detectedMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const isMobile = isMobileProp ?? detectedMobile;

  const moveTo = async (folderId?: string) => {
    setShowMoveSheet(false);
    setMoveAnchor(null);
    if (folderId !== chat.folderId) await moveChatToFolder(chat.id, folderId);
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
        onSelect={onSelect}
        onStartEdit={() => setEditing(true)}
        onCommitEdit={async (title) => {
          setEditing(false);
          await renameChat(chat.id, title);
        }}
        onCancelEdit={() => setEditing(false)}
        onDelete={() => setShowConfirm(true)}
        onMove={(anchor) => (isMobile ? setShowMoveSheet(true) : setMoveAnchor(anchor))}
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
            setEditing(true);
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
        title="Delete this chat?"
        description={`“${chat.title}” and its messages will be gone for good.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          void deleteChat(chat.id);
        }}
      />

      <MoveChatSheet
        open={showMoveSheet}
        chatTitle={chat.title}
        currentFolderId={chat.folderId}
        folders={folders}
        onClose={() => setShowMoveSheet(false)}
        onMove={moveTo}
      />

      {moveAnchor && (
        <MoveChatMenu
          anchor={moveAnchor}
          folders={folders}
          currentFolderId={chat.folderId}
          onClose={() => setMoveAnchor(null)}
          onMove={moveTo}
          onCreateAndMove={async (name) => {
            const folder = await createFolder(name);
            await moveTo(folder.id);
          }}
        />
      )}
    </>
  );
}
