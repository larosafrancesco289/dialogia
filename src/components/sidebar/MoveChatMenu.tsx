import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlusIcon } from '@heroicons/react/24/outline';
import type { Folder } from '@/lib/types';
import { useMenuKeyboard } from '@/lib/hooks/useMenuKeyboard';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';
import { buildFolderOptions } from '@/components/MoveChatSheet';
import { InlineTitleEdit } from '@/components/sidebar/InlineTitleEdit';

const WIDTH = 240;

/**
 * Move a chat on desktop: a small menu beside the row. The folder it is in
 * carries the tick; New folder names one in place and files the chat there.
 */
export function MoveChatMenu({
  anchor,
  folders,
  currentFolderId,
  onMove,
  onCreateAndMove,
  onClose,
}: {
  anchor: DOMRect;
  folders: Folder[];
  currentFolderId?: string;
  onMove: (folderId?: string) => void | Promise<void>;
  onCreateAndMove: (name: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const options = useMemo(() => buildFolderOptions(folders), [folders]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const newFolderRef = useRef<HTMLButtonElement | null>(null);
  const [naming, setNaming] = useState(false);
  const wasNamingRef = useRef(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  // Focus on the first folder, arrows between them, Escape back to the button.
  const onMenuKeyDown = useMenuKeyboard({ open: true, menuRef, onClose });

  useLayoutEffect(() => {
    const height = menuRef.current?.offsetHeight ?? 200;
    const left = Math.max(8, Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8));
    const below = anchor.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? anchor.top - height - 4 : below;
    setPosition({ left, top: Math.max(8, top) });
  }, [anchor, options.length, naming]);

  useDismissOnOutside({
    open: true,
    insideRefs: [menuRef],
    onOutsidePress: () => {
      // Clicking away keeps a folder name being typed, as every rename in
      // the app does: the field's blur creates it (an empty one cancels).
      const active = document.activeElement;
      if (active instanceof HTMLElement && menuRef.current?.contains(active)) active.blur();
      onClose();
    },
  });

  // Naming given up with Escape: back to the item that started it.
  useEffect(() => {
    const active = document.activeElement;
    if (wasNamingRef.current && !naming && (!active || active === document.body)) {
      newFolderRef.current?.focus();
    }
    wasNamingRef.current = naming;
  }, [naming]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Move to folder"
      className="popover fixed z-[90] p-1"
      style={{ left: position.left, top: position.top, width: WIDTH }}
      onKeyDown={onMenuKeyDown}
    >
      <div className="menu-heading">Move to</div>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={!currentFolderId}
        className="menu-item w-full text-left text-sm"
        onClick={() => void onMove(undefined)}
      >
        No folder
      </button>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitemradio"
          aria-checked={option.id === currentFolderId}
          className="menu-item w-full text-left text-sm truncate"
          style={{ paddingLeft: `calc(10px + ${option.depth} * 1rem)` }}
          onClick={() => void onMove(option.id)}
        >
          {option.label}
        </button>
      ))}
      <div className="menu-rule" />
      {naming ? (
        <div className="menu-item">
          <InlineTitleEdit
            value=""
            placeholder="Folder name"
            ariaLabel="New folder name"
            onCommit={(name) => onCreateAndMove(name)}
            onCancel={() => setNaming(false)}
          />
        </div>
      ) : (
        <button
          ref={newFolderRef}
          type="button"
          role="menuitem"
          className="menu-item w-full text-left text-sm flex items-center gap-2"
          onClick={() => setNaming(true)}
        >
          <FolderPlusIcon className="h-4 w-4 text-fg-muted" />
          New folder…
        </button>
      )}
    </div>,
    document.body,
  );
}
