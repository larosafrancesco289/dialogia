import { useEffect, useRef, useState } from 'react';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';

/**
 * Rename in place, in the row's own type: the old name is selected so typing
 * replaces it, Enter or clicking away keeps the new one, Escape leaves it as
 * it was. An empty or unchanged name simply closes, with nothing written.
 */
export function InlineTitleEdit({
  value,
  placeholder,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  value: string;
  placeholder?: string;
  ariaLabel: string;
  onCommit: (next: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const settled = useRef(false);
  const openedAt = useRef(0);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    openedAt.current = performance.now();
    input.focus();
    input.select();
  }, []);

  const finish = (keep: boolean, fromKeyboard = false) => {
    if (settled.current) return;
    settled.current = true;
    // Enter or Escape leaves focus on the row the field sits in (it takes
    // tabIndex -1 while editing), not dropped on the page with the field.
    // On a touch screen that is the on-screen keyboard's Return, and a ring
    // left on the row would read as a selection: the keyboard just goes.
    if (fromKeyboard && window.matchMedia(MEDIA_QUERIES.touch).matches) {
      inputRef.current?.blur();
    } else if (fromKeyboard) {
      inputRef.current?.parentElement?.closest<HTMLElement>('[tabindex]')?.focus();
    }
    const next = draft.trim();
    if (keep && next && next !== value) void onCommit(next);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      className="row-edit"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true, true);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false, true);
        }
      }}
      onBlur={() => {
        if (settled.current) return;
        // A blur in the first moments is the gesture that opened the field
        // settling (a drop, a double-click), not the user leaving: stay.
        if (performance.now() - openedAt.current < 400) {
          requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          });
          return;
        }
        finish(true);
      }}
    />
  );
}
