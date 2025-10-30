'use client';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import {
  XMarkIcon,
  EyeIcon,
  LightBulbIcon,
  MicrophoneIcon,
  ShieldCheckIcon,
  PhotoIcon,
  ChevronDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { CURATED_MODELS } from '@/data/curatedModels';
import { PINNED_MODEL_ID, DEFAULT_MODEL_ID, DEFAULT_MODEL_NAME } from '@/lib/constants';
import { findModelById, formatModelLabel, getModelCapabilities } from '@/lib/models';
import { describeModelPricing } from '@/lib/cost';
import { shallow } from 'zustand/shallow';
import type { Chat } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import { evaluateZdrModel, ZDR_NO_MATCH_NOTICE } from '@/lib/zdr';
import type { ZdrLists } from '@/lib/zdr';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { getModelTransportLabel } from '@/lib/providers';

export type ModelPickerVariant = 'auto' | 'sheet';

type Option = {
  id: string;
  name?: string;
};

type Controller = {
  chat?: Chat;
  options: Option[];
  allOptions: Option[];
  current?: Option;
  selectedId?: string;
  selectedIds: string[];
  setModels: (modelIds: string[]) => void;
  removeModelFromDropdown: (id: string) => void;
  modelMap: Map<string, ReturnType<typeof findModelById>>;
  ui: ReturnType<typeof useChatStore.getState>['ui'];
  zdrModelIds?: string[];
  zdrProviderIds?: string[];
  setUI: StoreState['setUI'];
  zdrHiddenCount: number;
  zdrRestricted: boolean;
  enableMultiModelChat: boolean;
};

export function useModelPickerController(): Controller {
  const {
    updateChatSettings,
    chats,
    selectedChatId,
    ui,
    setUI,
    favoriteModelIds,
    hiddenModelIds,
    removeModelFromDropdown,
    models,
    zdrModelIds,
    zdrProviderIds,
  } = useChatStore(
    (state) => ({
      updateChatSettings: state.updateChatSettings,
      chats: state.chats,
      selectedChatId: state.selectedChatId,
      ui: state.ui,
      setUI: state.setUI,
      favoriteModelIds: state.favoriteModelIds,
      hiddenModelIds: state.hiddenModelIds,
      removeModelFromDropdown: state.removeModelFromDropdown,
      models: state.models,
      zdrModelIds: state.zdrModelIds,
      zdrProviderIds: state.zdrProviderIds,
    }),
    shallow,
  );

  const chat = chats.find((c) => c.id === selectedChatId);
  const curated = CURATED_MODELS;

  const allowedIds = useMemo(() => new Set((models || []).map((m: any) => m.id)), [models]);

  const customOptions = useMemo(() => {
    return (favoriteModelIds || [])
      .filter((id: string) => allowedIds.has(id))
      .map((id: string) => ({ id, name: id }));
  }, [favoriteModelIds, allowedIds]);

  const allOptions = useMemo(() => {
    const injectedDefault = [{ id: DEFAULT_MODEL_ID, name: DEFAULT_MODEL_NAME }];
    return [...injectedDefault, ...curated, ...customOptions].reduce((acc: Option[], m: Option) => {
      if (!acc.find((x) => x.id === m.id)) acc.push(m);
      return acc;
    }, []);
  }, [customOptions]);

  const options = useMemo(() => {
    const hidden = new Set(hiddenModelIds || []);
    return allOptions.filter((m: Option) => {
      if (m.id === PINNED_MODEL_ID) return true;
      if (hidden.has(m.id)) return false;
      if (ui?.zdrOnly === true) return allowedIds.has(m.id);
      return true;
    });
  }, [allOptions, hiddenModelIds, ui?.zdrOnly, allowedIds]);

  const zdrHiddenCount = useMemo(() => {
    if (ui?.zdrOnly !== true) return 0;
    const hidden = new Set(hiddenModelIds || []);
    let count = 0;
    for (const option of allOptions) {
      if (option.id === PINNED_MODEL_ID) continue;
      if (hidden.has(option.id)) continue;
      if (!allowedIds.has(option.id)) count += 1;
    }
    return count;
  }, [ui?.zdrOnly, hiddenModelIds, allOptions, allowedIds]);

  const selectedIds = useMemo(() => {
    const fromChat = chat
      ? [
          chat.settings.model || DEFAULT_MODEL_ID,
          ...((chat.settings.parallel_models as string[] | undefined) ?? []),
        ]
      : [
          ui?.nextModel || DEFAULT_MODEL_ID,
          ...((ui?.nextParallelModels as string[] | undefined) ?? []),
        ];
    const cleaned = fromChat.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    const deduped: string[] = [];
    for (const id of cleaned) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    if (deduped.length === 0) deduped.push(DEFAULT_MODEL_ID);
    return deduped;
  }, [chat, ui?.nextModel, ui?.nextParallelModels]);

  const selectedId = selectedIds[0];
  const effectiveSelectedId =
    ui?.zdrOnly === true && selectedId && !allowedIds.has(selectedId) ? undefined : selectedId;
  const current =
    allOptions.find((o) => o.id === effectiveSelectedId) ||
    (effectiveSelectedId ? { id: effectiveSelectedId, name: effectiveSelectedId } : undefined) ||
    options[0];

  const setModels = (modelIds: string[]) => {
    const cleaned = modelIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    const deduped: string[] = [];
    for (const id of cleaned) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    const final = deduped.length ? deduped : [DEFAULT_MODEL_ID];
    const [primary, ...rest] = final;
    if (chat) {
      updateChatSettings({ model: primary, parallel_models: rest });
    } else {
      setUI({ nextModel: primary, nextParallelModels: rest });
    }
  };

  const modelMap = useMemo(() => {
    const map = new Map();
    for (const model of models || []) {
      map.set(model.id, model);
    }
    return map;
  }, [models]);

  return {
    chat,
    options,
    allOptions,
    current,
    selectedId,
    selectedIds,
    setModels,
    removeModelFromDropdown,
    modelMap,
    ui,
    zdrModelIds,
    zdrProviderIds,
    setUI,
    zdrHiddenCount,
    zdrRestricted: ui?.zdrOnly === true,
    enableMultiModelChat: ui?.enableMultiModelChat === true,
  };
}

export function ModelPicker({
  variant = 'auto',
  className = '',
}: {
  variant?: ModelPickerVariant;
  className?: string;
}) {
  const {
    options,
    current,
    selectedId,
    selectedIds,
    setModels,
    removeModelFromDropdown,
    modelMap,
    zdrModelIds,
    zdrProviderIds,
    setUI,
    zdrHiddenCount,
    zdrRestricted,
    enableMultiModelChat,
  } = useModelPickerController();

  const zdrLists = useMemo<ZdrLists>(
    () => ({
      modelIds: new Set(zdrModelIds || []),
      providerIds: new Set(zdrProviderIds || []),
    }),
    [zdrModelIds, zdrProviderIds],
  );

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(false);
  const isMobile = useIsMobile();
  const maxSelectable = enableMultiModelChat ? (isMobile ? 2 : 4) : 1;
  const limitTimeoutRef = useRef<number | null>(null);
  const [limitPulse, setLimitPulse] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);

  const deriveLabel = useCallback(
    (opt?: Option) => {
      if (!opt) return 'Pick model';
      return (
        formatModelLabel({
          model: modelMap.get(opt.id),
          fallbackId: opt.id,
          fallbackName: opt.name,
        }) || 'Pick model'
      );
    },
    [modelMap],
  );

  const normalizedFilter = useMemo(
    () => deferredFilter.trim().toLowerCase().replace(/\s+/g, ' '),
    [deferredFilter],
  );
  const filterWords = useMemo(
    () => (normalizedFilter ? normalizedFilter.split(' ') : []),
    [normalizedFilter],
  );

  const visibleOptions = useMemo(() => {
    if (!filterWords.length) return options;
    return options.filter((option) => {
      const meta = modelMap.get(option.id);
      const providerText = getModelTransportLabel(meta);
      const haystack = `${deriveLabel(option)} ${option.id} ${providerText}`.toLowerCase();
      return filterWords.every((word) => haystack.includes(word));
    });
  }, [options, filterWords, deriveLabel, modelMap]);

  useEffect(() => {
    if (selectedIds.length > maxSelectable) {
      setModels(selectedIds.slice(0, maxSelectable));
    }
  }, [selectedIds, maxSelectable, setModels]);

  useEffect(
    () => () => {
      if (limitTimeoutRef.current != null) {
        window.clearTimeout(limitTimeoutRef.current);
      }
    },
    [],
  );

  const toggleModel = useCallback(
    (id: string) => {
      const isSelected = selectedIds.includes(id);
      if (isSelected) {
        if (selectedIds.length === 1) return;
        const next = selectedIds.filter((value) => value !== id);
        setModels(next);
        return;
      }
      if (selectedIds.length >= maxSelectable) {
        // If multi-model is disabled, replace the current selection
        if (!enableMultiModelChat) {
          setModels([id]);
          setOpen(false);
          return;
        }
        setLimitPulse(true);
        if (limitTimeoutRef.current != null) {
          window.clearTimeout(limitTimeoutRef.current);
        }
        limitTimeoutRef.current = window.setTimeout(() => setLimitPulse(false), 1200);
        return;
      }
      setModels([...selectedIds, id]);
      // Close dropdown in single-model mode after selection
      if (!enableMultiModelChat) {
        setOpen(false);
      }
    },
    [selectedIds, maxSelectable, enableMultiModelChat, setModels],
  );

  const setPrimaryModel = useCallback(
    (id: string) => {
      if (!selectedIds.includes(id) || selectedIds[0] === id) return;
      const next = [id, ...selectedIds.filter((value) => value !== id)];
      setModels(next);
    },
    [selectedIds, setModels],
  );

  const selectionSummary = useMemo(() => {
    const entries = selectedIds.map((id) => {
      const meta = modelMap.get(id);
      return {
        label: deriveLabel({
          id,
          name: meta?.name || id,
        }),
        provider: getModelTransportLabel(meta),
      };
    });
    const labels = entries.map((entry) => entry.label);
    if (!labels.length) {
      const fallback = deriveLabel(current);
      return { button: fallback, tooltip: fallback };
    }
    if (labels.length === 1) {
      const providerLabel = entries[0]?.provider;
      const buttonLabel = providerLabel ? `${labels[0]} · ${providerLabel}` : labels[0];
      const tooltip = providerLabel ? `${labels[0]} (${providerLabel})` : labels[0];
      return { button: buttonLabel, tooltip };
    }
    const providerLabel = entries[0]?.provider;
    const button = providerLabel
      ? `${labels[0]} · ${providerLabel} +${labels.length - 1}`
      : `${labels[0]} +${labels.length - 1}`;
    const tooltip = entries
      .map((entry) => (entry.provider ? `${entry.label} (${entry.provider})` : entry.label))
      .join(', ');
    return { button, tooltip };
  }, [selectedIds, deriveLabel, modelMap, current]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setPopoverPos(null);
      setFilter('');
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && rootRef.current.contains(target)) return;
      if (listboxRef.current && listboxRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  useEffect(() => {
    if (!open || !mountedRef.current) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const margin = 16;
      const gap = 8;
      const triggerW = rect.width;
      const minWidth = variant === 'sheet' ? 280 : 320;
      const minHeight = variant === 'sheet' ? 220 : 200;
      const baseWidth = Math.max(triggerW, minWidth);
      const width = Math.min(viewportW - margin * 2, baseWidth);
      const left = Math.min(Math.max(rect.left, margin), viewportW - width - margin);
      const top = rect.bottom + gap;
      const availableHeight = Math.max(minHeight, viewportH - top - margin);
      const cappedHeight = Math.max(minHeight, Math.min(availableHeight, viewportH * 0.7));
      setPopoverPos({ left, top, width, maxHeight: cappedHeight });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const idx = Math.max(
      0,
      visibleOptions.findIndex((o) => o.id === (current?.id || '')),
    );
    setHighlightedIndex(idx === -1 ? 0 : idx);
    const timer = window.setTimeout(() => {
      if (filterInputRef.current) filterInputRef.current.focus();
      else listboxRef.current?.focus();
    }, 0);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.clearTimeout(timer);
    };
  }, [open, visibleOptions, current?.id, variant]);

  useEffect(() => {
    setHighlightedIndex((idx) => {
      if (!visibleOptions.length) return 0;
      if (idx >= visibleOptions.length) return Math.max(visibleOptions.length - 1, 0);
      return idx;
    });
  }, [visibleOptions.length]);

  const renderCapabilities = useCallback(
    (id: string) => {
      const meta = modelMap.get(id);
      const { canReason, canSee, canAudio, canImageOut } = getModelCapabilities(meta);
      const zdrStatus = evaluateZdrModel(id, zdrLists);
      const priceStr = describeModelPricing(meta);
      const context = meta?.context_length;
      return {
        canReason,
        canSee,
        canAudio,
        canImageOut,
        isZdr: zdrStatus.status === 'allowed',
        priceStr,
        context,
      };
    },
    [modelMap, zdrLists],
  );

  const zdrHiddenMessage = useMemo(() => {
    if (!zdrRestricted || zdrHiddenCount <= 0) return null;
    const countText =
      zdrHiddenCount === 1
        ? '1 model is hidden by the ZDR-only preference.'
        : `${zdrHiddenCount} models are hidden by the ZDR-only preference.`;
    return `${ZDR_NO_MATCH_NOTICE} ${countText}`;
  }, [zdrRestricted, zdrHiddenCount]);

  const focusOptionButton = (index: number) => {
    const container = listboxRef.current;
    if (!container) return;
    const button = container.querySelector<HTMLButtonElement>(
      `button[data-option-index="${index}"]`,
    );
    button?.focus();
  };

  return (
    <div className={`relative min-w-0 ${className}`.trim()} ref={rootRef}>
      <button
        className={`btn btn-outline min-w-0 w-full whitespace-nowrap overflow-hidden text-ellipsis flex items-center justify-between gap-2${limitPulse ? ' ring-2 ring-primary/50 border-primary/40' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selectionSummary.tooltip}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{selectionSummary.button}</span>
        <ChevronDownIcon className="h-4 w-4" />
      </button>

      {open &&
        popoverPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listboxRef}
            className="card p-2 overflow-auto popover z-[90] fixed flex flex-col gap-2"
            style={{
              left: popoverPos.left,
              top: popoverPos.top,
              width: popoverPos.width,
              maxHeight: popoverPos.maxHeight,
            }}
            role="listbox"
            aria-label="Select a model"
            aria-activedescendant={
              visibleOptions.length ? `model-opt-${highlightedIndex}` : undefined
            }
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!visibleOptions.length) return;
                setHighlightedIndex((i) => {
                  const next = (i + 1) % visibleOptions.length;
                  focusOptionButton(next);
                  return next;
                });
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!visibleOptions.length) return;
                setHighlightedIndex((i) => {
                  const prev = (i - 1 + visibleOptions.length) % visibleOptions.length;
                  focusOptionButton(prev);
                  return prev;
                });
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const target = visibleOptions[highlightedIndex];
                if (target) toggleModel(target.id);
              }
            }}
          >
            <div className="sticky top-0 z-10 flex items-center gap-2 rounded-full border border-border/30 bg-muted/15 px-3 py-1.5 backdrop-blur-sm focus-within:ring-2 focus-within:ring-primary/30 focus-within:bg-muted/30">
              <MagnifyingGlassIcon className="h-4 w-4 text-muted-foreground/80 shrink-0" />
              <input
                ref={filterInputRef}
                className="w-full rounded-full bg-transparent text-sm leading-tight text-muted-foreground focus:text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
                placeholder="Filter models"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                  if (!visibleOptions.length) return;
                  setHighlightedIndex(0);
                  focusOptionButton(0);
                  return;
                }
                if (event.key === 'Enter' && visibleOptions.length > 0) {
                  event.preventDefault();
                  toggleModel(visibleOptions[0].id);
                  return;
                }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    if (filter) setFilter('');
                    else setOpen(false);
                  }
                }}
              />
            </div>

            {enableMultiModelChat && (
              <div className="px-1 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Selected models {selectedIds.length}/{maxSelectable}
                  </span>
                  <span className="text-muted-foreground/70">
                    Primary column streams first
                  </span>
                </div>
              <div className="flex flex-wrap gap-2">
                {selectedIds.map((id, index) => {
                  const meta = modelMap.get(id);
                  const label = deriveLabel({
                    id,
                    name: meta?.name || id,
                  });
                  const providerLabel = getModelTransportLabel(meta);
                  const isPrimary = index === 0;
                  return (
                    <span
                      key={`selected-${id}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                        isPrimary
                          ? 'border-primary/60 bg-primary/10 text-primary'
                          : 'border-border/60 bg-muted/40'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-1 focus:outline-none"
                        onClick={() => setPrimaryModel(id)}
                        disabled={isPrimary}
                        title={isPrimary ? 'Primary model' : 'Make primary'}
                      >
                        {isPrimary && <CheckIcon className="h-3.5 w-3.5" />}
                        <span className="flex flex-col leading-tight">
                          <span className="truncate max-w-[140px]">{label}</span>
                          {providerLabel && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                              {providerLabel}
                            </span>
                          )}
                        </span>
                      </button>
                      {selectedIds.length > 1 && (
                        <button
                          type="button"
                          className="p-0.5 rounded-full hover:bg-muted/70 focus:outline-none"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleModel(id);
                          }}
                          title="Remove model"
                          aria-label={`Remove ${label}`}
                        >
                          <XMarkIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              {selectedIds.length >= maxSelectable && (
                <div className="text-xs text-amber-600">
                  Maximum of {maxSelectable} models on {isMobile ? 'mobile' : 'desktop'}.
                </div>
              )}
              </div>
            )}

            {zdrHiddenMessage && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1 space-y-1">
                  <div>{zdrHiddenMessage}</div>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline focus:outline-none focus:underline"
                    onClick={() => setUI({ zdrOnly: false })}
                  >
                    Show all models
                  </button>
                </div>
              </div>
            )}

            {visibleOptions.length === 0 && (
              <div className="text-sm text-muted-foreground px-3 py-4 text-center">
                No models found.
              </div>
            )}

            {visibleOptions.map((o, idx) => {
              const { canReason, canSee, canAudio, canImageOut, isZdr, priceStr, context } =
                renderCapabilities(o.id);
              const showPrice = variant !== 'sheet';
              const isSelected = selectedIds.includes(o.id);
              const isPrimary = selectedId === o.id;
              const isActive = idx === highlightedIndex;
              const meta = modelMap.get(o.id);
              const label = deriveLabel(o);
              const providerLabel = getModelTransportLabel(meta);

              const capabilityChips = (
                [
                  canReason
                    ? { icon: <LightBulbIcon className="h-3.5 w-3.5" />, text: 'Reasoning' }
                    : null,
                  canSee ? { icon: <EyeIcon className="h-3.5 w-3.5" />, text: 'Vision' } : null,
                  canAudio
                    ? { icon: <MicrophoneIcon className="h-3.5 w-3.5" />, text: 'Audio' }
                    : null,
                  canImageOut
                    ? { icon: <PhotoIcon className="h-3.5 w-3.5" />, text: 'Images' }
                    : null,
                  isZdr ? { icon: <ShieldCheckIcon className="h-3.5 w-3.5" />, text: 'ZDR' } : null,
                ] as Array<{ icon: ReactNode; text: string } | null>
              ).filter((chip): chip is { icon: ReactNode; text: string } => chip !== null);

              return (
                <div
                  key={o.id}
                  id={`model-opt-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`relative w-full rounded-xl border transition-colors ${
                    isActive
                      ? 'border-primary/40 bg-muted/50'
                      : 'border-transparent hover:bg-muted/30'
                  } ${
                    isSelected
                      ? isPrimary
                        ? 'ring-2 ring-primary/60 border-primary/50 bg-primary/5'
                        : 'ring-1 ring-primary/40 bg-muted/60'
                      : ''
                  }`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <button
                    type="button"
                    data-option-index={idx}
                    className="w-full text-left px-3 py-2.5 flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    onClick={() => toggleModel(o.id)}
                    onFocus={() => setHighlightedIndex(idx)}
                    onKeyDown={(event) => {
                      if (!visibleOptions.length) return;
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        const next = (idx + 1) % visibleOptions.length;
                        setHighlightedIndex(next);
                        focusOptionButton(next);
                      } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        const prev = (idx - 1 + visibleOptions.length) % visibleOptions.length;
                        setHighlightedIndex(prev);
                        focusOptionButton(prev);
                      } else if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleModel(o.id);
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className="font-semibold text-sm leading-tight truncate"
                            title={label}
                          >
                            {label}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                            {providerLabel && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5">
                                {providerLabel}
                              </span>
                            )}
                            <span
                              className="font-mono text-[11px] tracking-tight truncate"
                              title={o.id}
                            >
                              {o.id}
                            </span>
                            {context && (
                              <span className="inline-flex items-center gap-1 text-xs">
                                {numberFormatter.format(context)} ctx
                              </span>
                            )}
                          </div>
                        </div>
                        {showPrice && priceStr && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap leading-tight">
                            {priceStr}
                          </span>
                        )}
                      </div>

                      {capabilityChips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                          {capabilityChips.map((chip, idxChip) => (
                            <span
                              key={`${o.id}-cap-${idxChip}`}
                              className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-[3px]"
                            >
                              {chip.icon}
                              <span>{chip.text}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <CheckIcon className="h-4 w-4" />
                          {isPrimary ? 'Primary' : 'Selected'}
                        </span>
                      )}
                      {isSelected && !isPrimary && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="btn btn-ghost btn-xs px-2 py-1"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPrimaryModel(o.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setPrimaryModel(o.id);
                            }
                          }}
                        >
                          Make primary
                        </span>
                      )}
                    </div>
                  </button>
                  {o.id !== PINNED_MODEL_ID && (
                    <div className="flex justify-end px-3 pb-1 -mt-1">
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        title="Hide from dropdown"
                        aria-label="Hide model from dropdown"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeModelFromDropdown(o.id);
                        }}
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                        <span>Hide</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
