import { useEffect, useRef, useState } from 'react';

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

  const finish = (keep: boolean) => {
    if (settled.current) return;
    settled.current = true;
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
          finish(true);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => {
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
