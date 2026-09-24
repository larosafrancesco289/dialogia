import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { BottomSheet, SheetItem } from '@/components/ui/BottomSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MoveChatSheet } from '@/components/MoveChatSheet';
import { PencilSquareIcon, TrashIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import type { Chat } from '@/lib/types';
import { MoveChatMenu } from '@/components/sidebar/MoveChatMenu';
import { requestFolderRename } from '@/components/sidebar/pendingRename';
import { useDragAndDrop } from '@/lib/dragDrop';
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
  const [isDragOver, setIsDragOver] = useState(false);
  const { getDragData, dropChatOnChat } = useDragAndDrop();
  const detectedMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const isMobile = isMobileProp ?? detectedMobile;

  const moveTo = async (folderId?: string) => {
    setShowMoveSheet(false);
    setMoveAnchor(null);
    if (folderId === chat.folderId) return;
    await moveChatToFolder(chat.id, folderId);
    // Filed elsewhere, the row is drawn anew and the focus it had is dropped:
    // pick it up on the new row, if its folder is open.
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      document
        .querySelector<HTMLElement>(`.chat-item[data-chat-id="${CSS.escape(chat.id)}"]`)
        ?.focus({ preventScroll: true });
    });
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
        isTutor={!!chat.settings?.features?.tutor?.enabled}
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
        isDragOver={isDragOver}
        onDragOver={(event) => {
          const data = getDragData();
          // Only another chat can be dropped here; a folder falls through.
          if (!data || data.type !== 'chat' || data.id === chat.id) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={async (event) => {
          const data = getDragData();
          if (!data || data.type !== 'chat' || data.id === chat.id) return;
          event.preventDefault();
          event.stopPropagation();
          setIsDragOver(false);
          const folderId = await dropChatOnChat({ id: chat.id, folderId: chat.folderId });
          if (folderId) requestFolderRename(folderId);
        }}
        onPointerDown={longPress.onPointerDown}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerCancel={longPress.onPointerCancel}
      />

      <BottomSheet
        open={isMobile && showActions}
        label={`Actions for ${chat.title}`}
        title={chat.title}
        onClose={() => setShowActions(false)}
      >
        <SheetItem
          icon={<PencilSquareIcon />}
          onClick={() => {
            setShowActions(false);
            setEditing(true);
          }}
        >
          Rename
        </SheetItem>
        <SheetItem
          icon={<FolderOpenIcon />}
          onClick={() => {
            setShowActions(false);
            setShowMoveSheet(true);
          }}
        >
          Move to folder
        </SheetItem>
        <div className="sheet-rule" aria-hidden="true" />
        <SheetItem
          icon={<TrashIcon />}
          danger
          onClick={() => {
            setShowActions(false);
            setShowConfirm(true);
          }}
        >
          Delete
        </SheetItem>
      </BottomSheet>

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
        onCreateAndMove={async (name) => {
          const folder = await createFolder(name);
          await moveTo(folder.id);
        }}
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
