import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useDragAndDrop } from '@/lib/dragDrop';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { getFolderChildren, type FolderTreeIndex } from '@/lib/ui/sidebar/folderTree';
import { RowActionSheet } from '@/components/ui/RowActionSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChatRowContainer } from '@/components/sidebar/ChatRowContainer';
import { FolderRowView } from '@/components/sidebar/FolderRowView';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { Folder } from '@/lib/types';

interface FolderRowContainerProps {
  folder: Folder;
  folderTreeIndex: FolderTreeIndex;
  depth?: number;
}

export function FolderRowContainer({
  folder,
  folderTreeIndex,
  depth = 0,
}: FolderRowContainerProps) {
  const { selectedChatId, selectChat, renameFolder, deleteFolder, toggleFolderExpanded } =
    useChatStore(
      (s) => ({
        selectedChatId: s.selectedChatId,
        selectChat: s.selectChat,
        renameFolder: s.renameFolder,
        deleteFolder: s.deleteFolder,
        toggleFolderExpanded: s.toggleFolderExpanded,
      }),
      shallow,
    );

  const { handleDragOver, handleDrop, handleDragStart, handleDragEnd, getDragData } =
    useDragAndDrop();

  const [isEditing, setIsEditing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const { chats: folderChats, folders: subFolders } = getFolderChildren(folderTreeIndex, folder.id);

  const handleToggleExpanded = () => {
    toggleFolderExpanded(folder.id);
  };

  const handleDelete = async () => {
    await deleteFolder(folder.id);
  };

  const longPress = useLongPressSheet({
    enabled: isMobile && !isEditing,
    onLongPress: () => setShowActions(true),
    onTap: () => {
      if (!isEditing) handleToggleExpanded();
    },
    delayMs: 500,
    moveThreshold: 8,
  });

  return (
    <div data-row-press>
      <FolderRowView
        folderId={folder.id}
        name={folder.name}
        count={folderChats.length}
        depth={depth}
        isExpanded={folder.isExpanded}
        isEditing={isEditing}
        isDragOver={isDragOver}
        isMobile={isMobile}
        onToggleExpanded={handleToggleExpanded}
        onCommitEdit={async (name) => {
          setIsEditing(false);
          await renameFolder(folder.id, name);
        }}
        onCancelEdit={() => setIsEditing(false)}
        onStartEdit={() => setIsEditing(true)}
        onDelete={() => setShowDeleteConfirm(true)}
        onDragStart={() => handleDragStart(folder.id, 'folder')}
        onDragEnd={handleDragEnd}
        onDragOver={(event) => {
          handleDragOver(event);
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragOver(false);
          const dragData = getDragData();
          if (dragData && dragData.id !== folder.id) {
            await handleDrop(folder.id);
          }
        }}
        onPointerDown={longPress.onPointerDown}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerCancel={longPress.onPointerCancel}
      />

      <RowActionSheet
        open={isMobile && showActions}
        label={`Folder actions for ${folder.name}`}
        onClose={() => setShowActions(false)}
      >
        <button
          className="mobile-menu-item"
          onClick={() => {
            setShowActions(false);
            setIsEditing(true);
          }}
          title="Rename folder"
        >
          <PencilSquareIcon className="h-4 w-4" />
          <span>Rename folder</span>
        </button>
        <button
          className="mobile-menu-item is-danger"
          onClick={() => {
            setShowActions(false);
            setShowDeleteConfirm(true);
          }}
          title="Delete folder"
        >
          <TrashIcon className="h-4 w-4" />
          <span>Delete folder</span>
        </button>
      </RowActionSheet>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete this folder?"
        description={`The chats in “${folder.name}” stay; they move out of the folder.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          await handleDelete();
        }}
      />

      {folder.isExpanded && (
        <div>
          {subFolders.map((subFolder) => (
            <FolderRowContainer
              key={subFolder.id}
              folder={subFolder}
              folderTreeIndex={folderTreeIndex}
              depth={depth + 1}
            />
          ))}

          {folderChats.map((chat) => (
            <ChatRowContainer
              key={chat.id}
              chat={chat}
              depth={depth + 1}
              isSelected={selectedChatId === chat.id}
              onSelect={() => selectChat(chat.id)}
              onDragStart={(id) => handleDragStart(id, 'chat')}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
