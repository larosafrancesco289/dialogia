import { useEffect, useMemo, useState } from 'react';
import type { ModelDescriptor } from '@/lib/types';
import { getSlashSuggestions, type SlashSuggestion } from '@/lib/slash';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';

export type ComposerInputProps = {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  maxHeight: number;
  models: ModelDescriptor[];
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onFocusChange: (focused: boolean) => void;
};

export function ComposerInput({
  value,
  onChange,
  onSend,
  isStreaming,
  textareaRef,
  maxHeight,
  models,
  onPaste,
  onFocusChange,
}: ComposerInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchKeyboard = useMediaQuery(MEDIA_QUERIES.touch);

  const suggestions = useMemo<SlashSuggestion[]>(
    () => getSlashSuggestions(value, models),
    [value, models],
  );

  // Escape puts the list away until the text changes.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  const hasSuggestions = isFocused && suggestions.length > 0 && dismissedFor !== value;

  return (
    <>
      <textarea
        ref={textareaRef}
        enterKeyHint={touchKeyboard ? 'enter' : 'send'}
        className="composer-field focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none"
        rows={1}
        placeholder="Ask anything"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ maxHeight: `${maxHeight}px` }}
        onFocus={() => {
          setIsFocused(true);
          onFocusChange(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          onFocusChange(false);
        }}
        onPaste={onPaste}
        aria-controls={hasSuggestions ? 'slash-suggestions' : undefined}
        aria-activedescendant={hasSuggestions ? `slash-opt-${activeIndex}` : undefined}
        aria-autocomplete="list"
        onKeyDown={(event) => {
          if (isStreaming) return;
          if (hasSuggestions) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % suggestions.length);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
              return;
            }
            const pick = suggestions[activeIndex] || suggestions[0];
            // Enter on a command already typed out in full runs it.
            const complete = suggestions.some((s) => s.insert.trim() === value.trim());
            if (event.key === 'Tab' || (event.key === 'Enter' && !complete)) {
              event.preventDefault();
              if (pick) {
                onChange(pick.insert + (pick.insert.endsWith(' ') ? '' : ' '));
              }
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setDismissedFor(value);
              return;
            }
          }
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            onSend();
            return;
          }
          // An on-screen keyboard has no Shift+Return: there Return starts a
          // new line, as in every phone chat app, and the button sends.
          if (event.key === 'Enter' && !event.shiftKey && !touchKeyboard) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      {hasSuggestions && (
        <div
          id="slash-suggestions"
          role="listbox"
          className="absolute right-3 bottom-full mb-2 z-40 p-1 popover popover--up max-w-sm"
          aria-label="Slash command suggestions"
        >
          <div className="max-h-60 overflow-auto">
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.title + index}
                id={`slash-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`menu-item text-sm ${index === activeIndex ? 'font-semibold' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(suggestion.insert + (suggestion.insert.endsWith(' ') ? '' : ' '));
                  setActiveIndex(0);
                  textareaRef.current?.focus();
                }}
                onMouseEnter={() => setActiveIndex(index)}
                title={suggestion.subtitle || undefined}
              >
                {suggestion.title}
                {suggestion.subtitle ? (
                  <span className="ml-2 text-xs text-fg-muted">{suggestion.subtitle}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
