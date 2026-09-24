import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useId,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useAvailableModels } from '@/lib/hooks/useModelCatalog';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';
import {
  buildModelSearchResults,
  getHighlightSegments,
  normalizeModelQuery,
  splitModelQuery,
  type ModelSearchResult,
} from '@/lib/models/search';
import {
  CheckIcon,
  LightBulbIcon,
  PhotoIcon,
  MicrophoneIcon,
  EyeIcon,
  ShieldCheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const ICON_SIZE = 'h-4 w-4';

export type ModelSearchHandle = {
  focus: () => void;
  blur: () => void;
  clear: () => void;
};

export type ModelSearchProps = {
  onSelect: (result: ModelSearchResult) => void;
  selectedIds?: string[] | readonly string[];
  placeholder?: string;
  /** The field's accessible name; the placeholder when left out. */
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  emptyMessage?: string;
  maxResults?: number;
  clearOnSelect?: boolean;
  autoFocus?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  actionLabel?: string;
  selectedLabel?: string;
  dropdownRef?: RefObject<HTMLDivElement>;
};

export const ModelSearch = forwardRef<ModelSearchHandle | null, ModelSearchProps>(
  function ModelSearch(
    {
      onSelect,
      selectedIds,
      placeholder = 'Search models',
      ariaLabel,
      className = '',
      inputClassName = '',
      emptyMessage = 'No models found',
      maxResults = 60,
      clearOnSelect = false,
      autoFocus = false,
      onOpenChange,
      actionLabel = 'Add',
      selectedLabel = 'Added',
      dropdownRef: dropdownRefProp,
    },
    ref,
  ) {
    const { zdrModelIds, zdrProviderIds } = useChatStore(
      (state) => ({
        zdrModelIds: state.zdrModelIds,
        zdrProviderIds: state.zdrProviderIds,
      }),
      shallow,
    );

    const models = useAvailableModels();

    const [query, setQuery] = useState('');
    const normalizedQuery = useMemo(() => normalizeModelQuery(query), [query]);
    const queryWords = useMemo(() => splitModelQuery(normalizedQuery), [normalizedQuery]);
    const selectedSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const dropdownRef = dropdownRefProp ?? listRef;
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [position, setPosition] = useState<{
      left: number;
      top: number;
      width: number;
      maxHeight: number;
    } | null>(null);
    const listboxId = useId();

    const results = useMemo(() => {
      const modelsList = models || [];
      return buildModelSearchResults(modelsList, queryWords, {
        maxResults,
        zdrModelIds,
        zdrProviderIds,
      });
    }, [models, queryWords, maxResults, zdrModelIds, zdrProviderIds]);

    const closeDropdown = useCallback(() => {
      setQuery('');
      setPosition(null);
      setHighlightedIndex(0);
      onOpenChange?.(false);
    }, [onOpenChange]);

    const open = normalizedQuery.length > 0 && position !== null;

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      clear: () => closeDropdown(),
    }));

    useEffect(() => {
      if (!autoFocus) return;
      const tid = window.setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 60);
      return () => window.clearTimeout(tid);
    }, [autoFocus]);

    useLayoutEffect(() => {
      if (!normalizedQuery) {
        setPosition(null);
        onOpenChange?.(false);
        return;
      }
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const minDropdownHeight = 220;

      // Open upward if not enough space below but more space above
      const openUpward = spaceBelow < minDropdownHeight && spaceAbove > spaceBelow;

      if (openUpward) {
        const maxHeight = Math.max(minDropdownHeight, spaceAbove - gap);
        setPosition({
          left: rect.left,
          top: rect.top - gap - Math.min(maxHeight, 400),
          width: rect.width,
          maxHeight: Math.min(maxHeight, 400),
        });
      } else {
        const top = rect.bottom + gap;
        const maxHeight = Math.max(minDropdownHeight, viewportHeight - top - margin);
        setPosition({
          left: rect.left,
          top,
          width: rect.width,
          maxHeight,
        });
      }
      onOpenChange?.(true);
    }, [normalizedQuery, onOpenChange]);

    useEffect(() => {
      if (!normalizedQuery) return;
      const update = () => {
        const el = inputRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 12;
        const gap = 8;
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const minDropdownHeight = 220;

        const openUpward = spaceBelow < minDropdownHeight && spaceAbove > spaceBelow;

        if (openUpward) {
          const maxHeight = Math.max(minDropdownHeight, spaceAbove - gap);
          setPosition({
            left: rect.left,
            top: rect.top - gap - Math.min(maxHeight, 400),
            width: rect.width,
            maxHeight: Math.min(maxHeight, 400),
          });
        } else {
          const top = rect.bottom + gap;
          const maxHeight = Math.max(minDropdownHeight, viewportHeight - top - margin);
          setPosition({ left: rect.left, top, width: rect.width, maxHeight });
        }
      };
      const closeOnResize = () => {
        if (!document.contains(inputRef.current)) closeDropdown();
      };
      window.addEventListener('resize', update, true);
      window.addEventListener('scroll', update, true);
      window.addEventListener('blur', closeOnResize);
      return () => {
        window.removeEventListener('resize', update, true);
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('blur', closeOnResize);
      };
    }, [normalizedQuery, closeDropdown]);

    // Escape belongs to the field, which only sees it while focused.
    useDismissOnOutside({
      open: Boolean(normalizedQuery),
      insideRefs: [inputRef, dropdownRef],
      onOutsidePress: closeDropdown,
    });

    useEffect(() => {
      if (!results.length) {
        setHighlightedIndex(0);
        return;
      }
      setHighlightedIndex((idx) => {
        if (idx >= results.length) return Math.max(0, results.length - 1);
        return idx;
      });
    }, [results.length]);

    const handleSelect = (result: ModelSearchResult) => {
      onSelect(result);
      if (clearOnSelect) closeDropdown();
    };

    const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (!results.length) {
        if (event.key === 'Escape' && normalizedQuery) {
          event.preventDefault();
          closeDropdown();
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedIndex((idx) => (idx + 1) % results.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((idx) => (idx - 1 + results.length) % results.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const target = results[highlightedIndex];
        if (target) handleSelect(target);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDropdown();
      }
    };

    const renderCapabilities = (result: ModelSearchResult) => {
      const items: { icon: JSX.Element; label: string }[] = [];
      if (result.capabilities.reasoning)
        items.push({ icon: <LightBulbIcon className={ICON_SIZE} />, label: 'Reasoning' });
      if (result.capabilities.vision)
        items.push({ icon: <EyeIcon className={ICON_SIZE} />, label: 'Vision input' });
      if (result.capabilities.audio)
        items.push({ icon: <MicrophoneIcon className={ICON_SIZE} />, label: 'Audio input' });
      if (result.capabilities.image)
        items.push({ icon: <PhotoIcon className={ICON_SIZE} />, label: 'Image output' });
      if (result.capabilities.zdr)
        items.push({
          icon: <ShieldCheckIcon className={ICON_SIZE} />,
          label: 'Zero Data Retention',
        });
      if (!items.length) return null;
      return (
        <span className="model-row__caps">
          {items.map((item, idx) => (
            <span key={`${item.label}-${idx}`} title={item.label} aria-label={item.label}>
              {item.icon}
            </span>
          ))}
        </span>
      );
    };

    const renderHighlightedText = (text: string, keyPrefix: string) => {
      const segments = getHighlightSegments(text, queryWords);
      let counter = 0;
      return segments.map((segment) => {
        const key = `${keyPrefix}-${counter++}`;
        return segment.highlight ? (
          <mark key={key} className="model-row__match">
            {segment.text}
          </mark>
        ) : (
          <span key={key}>{segment.text}</span>
        );
      });
    };

    const formatDisplay = (result: ModelSearchResult) =>
      renderHighlightedText(result.displayName, `${result.id}-name`);

    const formatId = (result: ModelSearchResult) =>
      renderHighlightedText(result.fullId, `${result.id}-id`);

    const inputWrapperClasses = `model-search ${inputClassName}`.trim();

    return (
      <div className={`space-y-2 ${className}`.trim()}>
        <div className={inputWrapperClasses}>
          <MagnifyingGlassIcon className="model-search__icon" />
          <input
            ref={inputRef}
            className="model-search__input"
            placeholder={placeholder}
            aria-label={ariaLabel ?? placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
          />
        </div>

        {position &&
          normalizedQuery &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={dropdownRef}
              id={listboxId}
              role="listbox"
              className="popover fixed z-[95] p-1 overflow-auto"
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: position.maxHeight,
                overscrollBehavior: 'contain',
              }}
            >
              {results.length === 0 && (
                <div className="p-3 text-sm text-fg-muted">{emptyMessage}</div>
              )}
              {results.map((result, index) => {
                const isSelected = selectedSet.has(result.id);
                const isActive = index === highlightedIndex;
                return (
                  <button
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`model-row${isActive ? ' is-active' : ''}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
                      // Prevent blur before click completes (keeps dropdown open long enough)
                      event.preventDefault();
                    }}
                  >
                    <span className="model-row__main">
                      <span className="model-row__name">{formatDisplay(result)}</span>
                      <span className="model-row__meta">
                        <span>{result.providerLabel || result.provider}</span>
                        <span className="model-row__id">{formatId(result)}</span>
                        {result.contextLength && (
                          <span title="Context length">
                            {Intl.NumberFormat().format(result.contextLength)} tokens
                          </span>
                        )}
                        {result.price && <span>{result.price}</span>}
                      </span>
                    </span>
                    {renderCapabilities(result)}
                    <span className={`model-row__action${isSelected ? ' is-selected' : ''}`}>
                      {isSelected ? (
                        <>
                          <CheckIcon className={ICON_SIZE} />
                          {selectedLabel}
                        </>
                      ) : (
                        <>
                          <PlusSymbol />
                          {actionLabel}
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )}
      </div>
    );
  },
);

function PlusSymbol() {
  return (
    <svg className={ICON_SIZE} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 5.25a.75.75 0 0 1 .75.75v5.25h5.25a.75.75 0 1 1 0 1.5H12.75v5.25a.75.75 0 0 1-1.5 0V12.75H6a.75.75 0 0 1 0-1.5h5.25V6a.75.75 0 0 1 .75-.75Z"
        fill="currentColor"
      />
    </svg>
  );
}
