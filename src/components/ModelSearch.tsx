'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import {
  formatModelLabel,
  isAudioInputSupported,
  isImageOutputSupported,
  isReasoningSupported,
  isVisionSupported,
} from '@/lib/models';
import { describeModelPricing } from '@/lib/cost';
import { useChatStore } from '@/lib/store';
import type { ORModel } from '@/lib/types';
import {
  CheckIcon,
  ChevronRightIcon,
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

export type ModelSearchResult = {
  id: string;
  displayName: string;
  provider: string;
  shortId: string;
  fullId: string;
  price?: string;
  capabilities: {
    reasoning: boolean;
    vision: boolean;
    audio: boolean;
    image: boolean;
    zdr: boolean;
  };
  contextLength?: number;
  model?: ORModel;
};

export type ModelSearchProps = {
  onSelect: (result: ModelSearchResult) => void;
  selectedIds?: string[] | readonly string[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  emptyMessage?: string;
  maxResults?: number;
  clearOnSelect?: boolean;
  autoFocus?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  actionLabel?: string;
  selectedLabel?: string;
};

function buildResult(
  model: ORModel,
  opts: {
    zdrModelIds?: string[];
    zdrProviderIds?: string[];
  },
): ModelSearchResult {
  const provider = String(model.id).split('/')[0] || 'openrouter';
  const shortId = model.id.includes('/') ? model.id.split('/').slice(1).join('/') : model.id;
  const displayName = formatModelLabel({ model, fallbackId: model.id, fallbackName: model.name });
  const price = describeModelPricing(model);
  const capabilities = {
    reasoning: isReasoningSupported(model),
    vision: isVisionSupported(model),
    audio: isAudioInputSupported(model),
    image: isImageOutputSupported(model),
    zdr:
      Boolean(opts.zdrModelIds && opts.zdrModelIds.includes(model.id)) ||
      Boolean(opts.zdrProviderIds && opts.zdrProviderIds.includes(provider)),
  };
  return {
    id: model.id,
    displayName,
    provider,
    shortId,
    fullId: model.id,
    price,
    capabilities,
    contextLength: model.context_length,
    model,
  };
}

function renderHighlightedText(text: string, queryWords: string[], keyPrefix: string) {
  if (!queryWords.length) return text;
  const pattern = queryWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!pattern) return text;
  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const matcher = new RegExp(`^(${pattern})$`, 'i');
    const segments = text.split(regex).filter((segment) => segment.length > 0);
    if (!segments.length) return text;
    let counter = 0;
    return segments.map((segment) => {
      const key = `${keyPrefix}-${counter++}`;
      if (matcher.test(segment)) {
        return (
          <mark key={key} className="rounded bg-primary/15 px-1 py-0 text-primary">
            {segment}
          </mark>
        );
      }
      return <span key={key}>{segment}</span>;
    });
  } catch {
    return text;
  }
}

export const ModelSearch = forwardRef<ModelSearchHandle | null, ModelSearchProps>(
  function ModelSearch(
    {
      onSelect,
      selectedIds,
      placeholder = 'Search models',
      className = '',
      inputClassName = '',
      emptyMessage = 'No models found',
      maxResults = 60,
      clearOnSelect = false,
      autoFocus = false,
      onOpenChange,
      actionLabel = 'Add',
      selectedLabel = 'Added',
    },
    ref,
  ) {
    const { models, zdrModelIds, zdrProviderIds } = useChatStore(
      (state) => ({
        models: state.models,
        zdrModelIds: state.zdrModelIds,
        zdrProviderIds: state.zdrProviderIds,
      }),
      shallow,
    );

    const [query, setQuery] = useState('');
    const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const queryWords = normalizedQuery ? normalizedQuery.split(' ') : [];
    const selectedSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [position, setPosition] = useState<{
      left: number;
      top: number;
      width: number;
      maxHeight: number;
    } | null>(null);

    const results = useMemo(() => {
      if (!normalizedQuery) return [] as ModelSearchResult[];
      const modelsList = models || [];
      const filtered = modelsList.filter((model) => {
        const hay = `${model.id} ${model.name ?? ''}`.toLowerCase();
        return queryWords.every((word) => hay.includes(word));
      });
      return filtered
        .slice(0, maxResults)
        .map((model) => buildResult(model, { zdrModelIds, zdrProviderIds }));
    }, [models, normalizedQuery, queryWords, maxResults, zdrModelIds, zdrProviderIds]);

    const closeDropdown = () => {
      setQuery('');
      setPosition(null);
      setHighlightedIndex(0);
      onOpenChange?.(false);
    };

    const open = normalizedQuery.length > 0 && position !== null;

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      clear: () => closeDropdown(),
    }));

    useEffect(() => {
      if (!autoFocus) return;
      const tid = window.setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true } as any);
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
      const top = rect.bottom + 8;
      const viewportHeight = window.innerHeight;
      const maxHeight = Math.max(220, viewportHeight - top - margin);
      setPosition({
        left: rect.left,
        top,
        width: rect.width,
        maxHeight,
      });
      onOpenChange?.(true);
    }, [normalizedQuery, onOpenChange]);

    useEffect(() => {
      if (!normalizedQuery) return;
      const update = () => {
        const el = inputRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 12;
        const top = rect.bottom + 8;
        const viewportHeight = window.innerHeight;
        const maxHeight = Math.max(220, viewportHeight - top - margin);
        setPosition({ left: rect.left, top, width: rect.width, maxHeight });
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
    }, [normalizedQuery]);

    useEffect(() => {
      if (!normalizedQuery) return;
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (inputRef.current && inputRef.current.contains(target)) return;
        if (listRef.current && listRef.current.contains(target)) return;
        closeDropdown();
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [normalizedQuery]);

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
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-2">
          {items.map((item, idx) => (
            <span
              key={`${item.label}-${idx}`}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"
              title={item.label}
            >
              {item.icon}
              <span className="leading-none">{item.label}</span>
            </span>
          ))}
        </div>
      );
    };

    const formatDisplay = (result: ModelSearchResult) =>
      renderHighlightedText(result.displayName, queryWords, `${result.id}-name`);

    const formatId = (result: ModelSearchResult) =>
      renderHighlightedText(result.fullId, queryWords, `${result.id}-id`);

    const inputWrapperClasses =
      `relative rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-primary/70 transition-shadow ${inputClassName}`.trim();
    const inputClasses = 'input w-full border-0 bg-transparent focus:ring-0 focus:outline-none';

    return (
      <div className={`space-y-2 ${className}`.trim()}>
        <div className={inputWrapperClasses}>
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            className={`${inputClasses} pl-11 pr-3 py-3`}
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={onInputKeyDown}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls="model-search-results"
            autoComplete="off"
          />
        </div>

        {position &&
          normalizedQuery &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={listRef}
              id="model-search-results"
              role="listbox"
              className="fixed z-[95] card p-2 overflow-auto shadow-[var(--shadow-card)]"
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: position.maxHeight,
                overscrollBehavior: 'contain',
              }}
            >
              {results.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">{emptyMessage}</div>
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
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors border border-transparent ${
                      isActive ? 'bg-muted/70 border-border' : 'hover:bg-muted'
                    } ${isSelected ? 'ring-1 ring-primary/40' : ''}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
                      // Prevent blur before click completes (keeps dropdown open long enough)
                      event.preventDefault();
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground leading-tight">
                          {formatDisplay(result)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-mono text-[11px] tracking-tight whitespace-nowrap">
                            {formatId(result)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <ChevronRightIcon className="h-3.5 w-3.5" />
                            <span className="capitalize">{result.provider}</span>
                          </span>
                          {result.contextLength && (
                            <span title="Context length" className="whitespace-nowrap">
                              {Intl.NumberFormat().format(result.contextLength)} tokens
                            </span>
                          )}
                          {result.price && (
                            <span className="whitespace-nowrap">{result.price}</span>
                          )}
                        </div>
                        {renderCapabilities(result)}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs font-medium text-muted-foreground">
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <CheckIcon className={ICON_SIZE} />
                            {selectedLabel}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <PlusSymbol />
                            {actionLabel}
                          </span>
                        )}
                      </div>
                    </div>
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
