'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ORModel } from '@/lib/types';
import { getSlashSuggestions, type SlashSuggestion } from '@/lib/slash';

export type ComposerInputProps = {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  maxHeight: number;
  models: ORModel[];
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onFocusChange: (focused: boolean) => void;
};

export default function ComposerInput({
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

  const suggestions = useMemo<SlashSuggestion[]>(
    () => getSlashSuggestions(value, models),
    [value, models],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  const hasSuggestions = isFocused && suggestions.length > 0;

  return (
    <>
      <textarea
        ref={textareaRef}
        className="textarea flex-1 min-w-0 text-base"
        rows={1}
        placeholder="Type a message..."
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
        aria-expanded={hasSuggestions ? true : undefined}
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
            if (event.key === 'Tab' || event.key === 'Enter') {
              event.preventDefault();
              const pick = suggestions[activeIndex] || suggestions[0];
              if (pick) {
                onChange(pick.insert + (pick.insert.endsWith(' ') ? '' : ' '));
              }
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setActiveIndex(0);
              return;
            }
          }
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            onSend();
            return;
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      {hasSuggestions && (
        <div
          id="slash-suggestions"
          role="listbox"
          className="absolute right-3 bottom-full mb-2 z-40 card p-1 popover max-w-sm"
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
                  <span className="ml-2 text-xs text-muted-foreground">{suggestion.subtitle}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
