import { useId, useRef, type PointerEvent } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import {
  AcademicCapIcon,
  PencilSquareIcon,
  TrashIcon,
  FolderArrowDownIcon,
} from '@heroicons/react/24/outline';
import { InlineTitleEdit } from '@/components/sidebar/InlineTitleEdit';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n';
import { displayChatTitle, splitBranchTitle } from '@/lib/ui/chatTitle';

export type ChatRowViewProps = {
  chatId: string;
  title: string;
  /** A tutoring session: marked with the tutor's cap, so it stands out. */
  isTutor?: boolean;
  depth: number;
  collapsed: boolean;
  isMobile: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommitEdit: (title: string) => void | Promise<void>;
  onCancelEdit: () => void;
  onDelete: () => void;
  onMove: (anchor: DOMRect) => void;
  onDragStart: (chatId: string) => void;
  onDragEnd: () => void;
  isDragOver?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
};

/** Rows inside a folder start where the folder's name starts. */
export const ROW_INDENT = 24;

export function ChatRowView({
  chatId,
  title,
  isTutor = false,
  depth,
  collapsed,
  isMobile,
  isSelected,
  isEditing,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
  isDragOver = false,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
}: ChatRowViewProps) {
  const t = useT();
  // The title it was drawn with. A later one (the generated title arriving,
  // a rename) fades in; the list's first paint does not.
  const firstTitle = useRef(title);
  const retitled = title !== firstTitle.current;
  const showTitle = !collapsed || isEditing;
  // A branch shares its chat's title: the marker that tells them apart is kept
  // out of the truncation, which would otherwise cut it first.
  const { name, branch } = splitBranchTitle(title);
  const shownTitle = displayChatTitle(title);
  const allowActions = !collapsed && !isEditing;
  const titleId = useId();

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 cursor-pointer group chat-item ${
        isSelected ? 'selected' : ''
      }${isEditing ? ' is-editing' : ''}${isDragOver ? ' is-drag-over' : ''}`}
      data-chat-id={chatId}
      // The row truncates a long title; hovering reads it whole.
      title={isEditing ? undefined : shownTitle}
      style={depth ? { marginLeft: `${depth * ROW_INDENT}px` } : undefined}
      draggable={!isMobile && !isEditing}
      onDragStart={() => {
        if (isMobile) return;
        onDragStart(chatId);
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={!isEditing && !isMobile ? onSelect : undefined}
      onDoubleClick={!isMobile && !isEditing ? onStartEdit : undefined}
      // Reachable by keyboard: Enter or Space opens the chat, F2 renames it.
      // A link to the chat, named by its title alone: the row's own buttons
      // are read on their own, not as part of its name.
      tabIndex={isEditing ? -1 : 0}
      role={isEditing ? undefined : 'link'}
      aria-labelledby={!isEditing && showTitle ? titleId : undefined}
      aria-label={!isEditing && !showTitle ? shownTitle : undefined}
      aria-current={isSelected ? 'page' : undefined}
      onKeyDown={(event) => {
        if (isEditing || event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        } else if (event.key === 'F2') {
          event.preventDefault();
          onStartEdit();
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
    >
      {isEditing ? (
        <InlineTitleEdit
          value={title}
          ariaLabel={t('chatRow.name')}
          onCommit={onCommitEdit}
          onCancel={onCancelEdit}
        />
      ) : showTitle ? (
        <>
          {isTutor && <AcademicCapIcon className="chat-item__kind" aria-hidden="true" />}
          <div
            key={title}
            id={titleId}
            className={cn('flex flex-1 min-w-0 text-sm', retitled && 'chat-item__title--new')}
          >
            {isTutor && <span className="sr-only">{t('chatRow.tutoring')} </span>}
            <span className="truncate">{name}</span>
            {branch && <span className="chat-item__branch">{t('chat.branchMark')}</span>}
          </div>
        </>
      ) : null}

      {allowActions && (
        <div className="chat-item__actions">
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onStartEdit();
            }}
            title={t('chatRow.rename')}
            ariaLabel={t('chatRow.renameNamed', { title: shownTitle })}
          >
            <PencilSquareIcon />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              const target = e?.currentTarget as HTMLElement | undefined;
              if (target) onMove(target.getBoundingClientRect());
            }}
            title={t('chatRow.move')}
            ariaLabel={t('chatRow.moveNamed', { title: shownTitle })}
          >
            <FolderArrowDownIcon />
          </IconButton>
          <IconButton
            size="sm"
            onClick={(e) => {
              e?.stopPropagation();
              onDelete();
            }}
            title={t('common.delete')}
            ariaLabel={t('chatRow.deleteNamed', { title: shownTitle })}
          >
            <TrashIcon />
          </IconButton>
        </div>
      )}
    </div>
  );
}
