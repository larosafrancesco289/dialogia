import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { ChevronRightIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { InlineTitleEdit } from '@/components/sidebar/InlineTitleEdit';
import { ROW_INDENT } from '@/components/sidebar/ChatRowView';
import { createSingleClickDeferral } from '@/lib/ui/clickIntent';

export type FolderRowViewProps = {
  folderId: string;
  /** The id of the list the folder opens onto. */
  listId: string;
  name: string;
  count: number;
  depth: number;
  isExpanded: boolean;
  isEditing: boolean;
  isDragOver: boolean;
  isMobile: boolean;
  onToggleExpanded: () => void;
  onCommitEdit: (name: string) => void | Promise<void>;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
};

/**
 * A folder is a row like a chat: a chevron that turns as it opens, the name,
 * how many chats it holds, and the same actions on hover or focus. The
 * chevron, name and count are one button that folds it; the actions sit
 * beside it, since a button cannot hold other buttons.
 */
export function FolderRowView({
  folderId,
  listId,
  name,
  count,
  depth,
  isExpanded,
  isEditing,
  isDragOver,
  isMobile,
  onToggleExpanded,
  onCommitEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
}: FolderRowViewProps) {
  // A double click renames; folding waits to be sure it was a single click,
  // so the folder does not open and shut again before the name field shows.
  const toggleRef = useRef(onToggleExpanded);
  toggleRef.current = onToggleExpanded;
  const [clicks] = useState(() => createSingleClickDeferral(() => toggleRef.current()));
  useEffect(() => clicks.cancel, [clicks]);

  // A rename finished by key leaves focus on the row (tabIndex -1 while
  // editing), which loses it as the tabIndex goes: it belongs on the button
  // that takes the field's place.
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const rowHeldFocus = useRef(false);
  const wasEditing = useRef(isEditing);
  useLayoutEffect(() => {
    const ended = wasEditing.current && !isEditing;
    const held = rowHeldFocus.current;
    wasEditing.current = isEditing;
    rowHeldFocus.current = false;
    if (ended && held) toggleButtonRef.current?.focus({ preventScroll: true });
  }, [isEditing]);

  const chevron = (
    <ChevronRightIcon
      className={`folder-row__chevron${isExpanded ? ' is-open' : ''}`}
      aria-hidden="true"
    />
  );

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item folder-row${
        isDragOver ? ' is-drag-over' : ''
      }${isEditing ? ' is-editing' : ''}${isExpanded ? ' is-expanded' : ''}`}
      style={depth ? { marginLeft: `${depth * ROW_INDENT}px` } : undefined}
      // Folders do not nest or reorder, so a folder is not something to drag.
      draggable={false}
      tabIndex={isEditing ? -1 : undefined}
      onFocus={(event) => {
        if (isEditing && event.target === event.currentTarget) rowHeldFocus.current = true;
      }}
      data-folder-id={folderId}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      // The whole row folds it, not only the button. A tap on a phone is the
      // long-press hook's; a key or assistive tech's press (no pointer) folds
      // it on any layout.
      onClick={(event) => {
        if (isEditing || (isMobile && event.detail !== 0)) return;
        clicks.click(event.detail);
      }}
      onDoubleClick={
        !isMobile && !isEditing
          ? () => {
              clicks.cancel();
              onStartEdit();
            }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isEditing ? (
        <>
          {chevron}
          <InlineTitleEdit
            value={name}
            ariaLabel="Folder name"
            onCommit={onCommitEdit}
            onCancel={onCancelEdit}
          />
        </>
      ) : (
        <button
          ref={toggleButtonRef}
          type="button"
          className="folder-row__toggle flex flex-1 min-w-0 items-center gap-2 text-left"
          aria-expanded={isExpanded}
          aria-controls={listId}
          // Enter or Space folds it (a click with no pointer), F2 renames it.
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              event.preventDefault();
              onStartEdit();
            }
          }}
        >
          {chevron}
          <span className="flex-1 min-w-0 text-sm truncate folder-row__name">{name}</span>
          <span
            className="folder-row__count"
            aria-label={`${count} ${count === 1 ? 'chat' : 'chats'}`}
          >
            {count}
          </span>
        </button>
      )}

      {!isEditing && (
        <div className="chat-item__actions">
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onStartEdit();
            }}
            title="Rename folder"
          >
            <PencilSquareIcon />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onDelete();
            }}
            title="Delete folder"
          >
            <TrashIcon />
          </IconButton>
        </div>
      )}
    </div>
  );
}
