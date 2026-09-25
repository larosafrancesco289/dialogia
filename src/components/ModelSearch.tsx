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
  normalizeModelQuery,
  splitModelQuery,
  type ModelSearchResult,
} from '@/lib/models/search';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { ModelRowContent } from '@/components/model-picker/ModelRow';
import { useFieldDropdownPosition } from '@/components/model-picker/useFieldDropdownPosition';

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
    const [position, setPosition] = useFieldDropdownPosition(inputRef, normalizedQuery);
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
    }, [onOpenChange, setPosition]);

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
      onOpenChange?.(Boolean(normalizedQuery));
    }, [normalizedQuery, onOpenChange]);

    useEffect(() => {
      if (!normalizedQuery) return;
      const closeOnResize = () => {
        if (!document.contains(inputRef.current)) closeDropdown();
      };
      window.addEventListener('blur', closeOnResize);
      return () => window.removeEventListener('blur', closeOnResize);
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
              {results.length === 0 && <p className="model-picker__empty">{emptyMessage}</p>}
              {results.map((result, index) => {
                const isSelected = selectedSet.has(result.id);
                const isActive = index === highlightedIndex;
                return (
                  <button
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`model-row${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
                      // Prevent blur before click completes (keeps dropdown open long enough)
                      event.preventDefault();
                    }}
                  >
                    <ModelRowContent name={result.displayName} words={queryWords} result={result} />
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
