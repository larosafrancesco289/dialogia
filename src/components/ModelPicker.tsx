'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
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
  ChevronUpIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { CURATED_MODELS, type CuratedModel } from '@/data/curatedModels';
import { PINNED_MODEL_ID, DEFAULT_MODEL_ID, DEFAULT_MODEL_NAME } from '@/lib/constants';
import { findModelById, formatModelLabel, getModelCapabilities } from '@/lib/models';
import { describeModelPricing } from '@/lib/cost';
import { shallow } from 'zustand/shallow';
import type { Chat } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import { evaluateZdrModel } from '@/lib/policy/zdr';
import type { ZdrLists } from '@/lib/policy/zdr';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { getModelTransportLabel } from '@/lib/providers';
import { ModelSearch, type ModelSearchResult } from './ModelSearch';

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
  toggleFavoriteModel: (id: string) => void;
  favoriteModelIds: string[];
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
    toggleFavoriteModel,
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
      toggleFavoriteModel: state.toggleFavoriteModel,
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
  }, [customOptions, curated]);

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
      : [ui?.next?.model || DEFAULT_MODEL_ID, ...((ui?.next?.parallelModels as string[] | undefined) ?? [])];
    const cleaned = fromChat.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    const deduped: string[] = [];
    for (const id of cleaned) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    if (deduped.length === 0) deduped.push(DEFAULT_MODEL_ID);
    return deduped;
  }, [chat, ui?.next?.model, ui?.next?.parallelModels]);

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
      setUI({ next: { model: primary, parallelModels: rest } });
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
    toggleFavoriteModel,
    favoriteModelIds: favoriteModelIds || [],
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

function ModelCard({
  model,
  isSelected,
  onSelect,
  modelMap,
  zdrLists,
  numberFormatter,
}: {
  model: CuratedModel;
  isSelected: boolean;
  onSelect: (id: string) => void;
  modelMap: Map<string, ReturnType<typeof findModelById>>;
  zdrLists: ZdrLists;
  numberFormatter: Intl.NumberFormat;
}) {
  const { Icon } = model;
  const meta = modelMap.get(model.id);
  const { canReason, canSee, canImageOut } = getModelCapabilities(meta);
  const zdrStatus = evaluateZdrModel(model.id, zdrLists);
  const isZdr = zdrStatus.status === 'allowed';
  const price = describeModelPricing(meta);
  const context = meta?.context_length;

  return (
    <button
      type="button"
      onClick={() => onSelect(model.id)}
      className={`card p-4 text-left transition-all hover:border-primary/40 ${
        isSelected ? 'ring-2 ring-primary border-primary/50 bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium truncate flex-1">{model.name}</span>
        {isSelected && <CheckIcon className="h-4 w-4 text-primary shrink-0" />}
      </div>

      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{model.description}</p>

      <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground/70">
        {canReason && (
          <span className="inline-flex items-center gap-1">
            <LightBulbIcon className="h-3 w-3" /> Reasoning
          </span>
        )}
        {canSee && (
          <span className="inline-flex items-center gap-1">
            <EyeIcon className="h-3 w-3" /> Vision
          </span>
        )}
        {canImageOut && (
          <span className="inline-flex items-center gap-1">
            <PhotoIcon className="h-3 w-3" /> Images
          </span>
        )}
        {isZdr && (
          <span className="inline-flex items-center gap-1">
            <ShieldCheckIcon className="h-3 w-3" /> ZDR
          </span>
        )}
        {context && <span>{numberFormatter.format(context)} ctx</span>}
        {price && <span>• {price}</span>}
      </div>
    </button>
  );
}

function FavoriteModelCard({
  modelId,
  isSelected,
  onSelect,
  onRemove,
  modelMap,
  zdrLists,
  numberFormatter,
}: {
  modelId: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  modelMap: Map<string, ReturnType<typeof findModelById>>;
  zdrLists: ZdrLists;
  numberFormatter: Intl.NumberFormat;
}) {
  const meta = modelMap.get(modelId);
  const { canReason, canSee, canImageOut } = getModelCapabilities(meta);
  const zdrStatus = evaluateZdrModel(modelId, zdrLists);
  const isZdr = zdrStatus.status === 'allowed';
  const price = describeModelPricing(meta);
  const context = meta?.context_length;
  const label = formatModelLabel({ model: meta, fallbackId: modelId, fallbackName: modelId });
  const providerLabel = getModelTransportLabel(meta);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onSelect(modelId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onSelect(modelId)}
      onKeyDown={handleKeyDown}
      className={`group card p-3 pr-10 relative transition-all hover:border-primary/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        isSelected ? 'ring-2 ring-primary border-primary/50 bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium truncate">{label}</span>
        {isSelected && <CheckIcon className="h-4 w-4 text-primary shrink-0" />}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground/70">
        {providerLabel && (
          <span className="uppercase text-[10px] tracking-wide">{providerLabel}</span>
        )}
        {canReason && (
          <span className="inline-flex items-center gap-0.5">
            <LightBulbIcon className="h-3 w-3" />
          </span>
        )}
        {canSee && (
          <span className="inline-flex items-center gap-0.5">
            <EyeIcon className="h-3 w-3" />
          </span>
        )}
        {canImageOut && (
          <span className="inline-flex items-center gap-0.5">
            <PhotoIcon className="h-3 w-3" />
          </span>
        )}
        {isZdr && (
          <span className="inline-flex items-center gap-0.5">
            <ShieldCheckIcon className="h-3 w-3" />
          </span>
        )}
        {context && <span>{numberFormatter.format(context)} ctx</span>}
        {price && <span>• {price}</span>}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(modelId);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
        title="Remove from favorites"
        aria-label="Remove from favorites"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddModelSearch({
  onAddFavorite,
  favoriteIds,
  curatedIds,
}: {
  onAddFavorite: (result: ModelSearchResult) => void;
  favoriteIds: string[];
  curatedIds: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const alreadyAddedIds = useMemo(
    () => [...favoriteIds, ...curatedIds],
    [favoriteIds, curatedIds],
  );

  return (
    <div className="border-t border-border/50 pt-5 mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full transition-colors"
      >
        {expanded ? (
          <ChevronUpIcon className="h-4 w-4" />
        ) : (
          <ChevronDownIcon className="h-4 w-4" />
        )}
        <span>Add more models to favorites</span>
        <span className="text-xs text-muted-foreground/60 ml-1">(200+ available)</span>
      </button>

      {expanded && (
        <div className="mt-4">
          <ModelSearch
            onSelect={onAddFavorite}
            selectedIds={alreadyAddedIds}
            clearOnSelect
            placeholder="Search models to add..."
            actionLabel="Add"
            selectedLabel="Added"
          />
        </div>
      )}
    </div>
  );
}

export function ModelPicker({
  className = '',
}: {
  variant?: ModelPickerVariant;
  className?: string;
}) {
  const {
    current,
    selectedIds,
    setModels,
    toggleFavoriteModel,
    favoriteModelIds,
    modelMap,
    zdrModelIds,
    zdrProviderIds,
    enableMultiModelChat,
  } = useModelPickerController();

  const zdrLists = useMemo<ZdrLists>(
    () => ({
      modelIds: new Set(zdrModelIds || []),
      providerIds: new Set(zdrProviderIds || []),
    }),
    [zdrModelIds, zdrProviderIds],
  );

  const curatedIds = useMemo(() => CURATED_MODELS.map((m) => m.id), []);

  // Filter out favorites that are already in curated list
  const uniqueFavorites = useMemo(() => {
    const curatedSet = new Set(curatedIds);
    return favoriteModelIds.filter((id) => !curatedSet.has(id));
  }, [favoriteModelIds, curatedIds]);

  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const favoritesEndRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const maxSelectable = enableMultiModelChat ? (isMobile ? 2 : 4) : 1;
  const limitTimeoutRef = useRef<number | null>(null);
  const [limitPulse, setLimitPulse] = useState(false);
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
      if (!enableMultiModelChat) {
        setOpen(false);
      }
    },
    [selectedIds, maxSelectable, enableMultiModelChat, setModels],
  );

  const handleAddFavorite = useCallback(
    (result: ModelSearchResult) => {
      // Add to favorites if not already there
      const isFavorite = favoriteModelIds.includes(result.id) || curatedIds.includes(result.id);
      if (!isFavorite) {
        toggleFavoriteModel(result.id);
        // Scroll to show the new favorite after a short delay
        setTimeout(() => {
          favoritesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
      // Also select the model
      if (!selectedIds.includes(result.id)) {
        toggleModel(result.id);
      }
    },
    [favoriteModelIds, curatedIds, selectedIds, toggleFavoriteModel, toggleModel],
  );

  const handleRemoveFavorite = useCallback(
    (id: string) => {
      toggleFavoriteModel(id);
    },
    [toggleFavoriteModel],
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

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  // Close on click outside (but not on search dropdown portals)
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (modalRef.current && modalRef.current.contains(target)) return;
      // Don't close if clicking on ModelSearch dropdown (which is portaled to body)
      const searchDropdown = document.getElementById('model-search-results');
      if (searchDropdown && searchDropdown.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  return (
    <div className={`relative min-w-0 ${className}`.trim()}>
      <button
        className={`btn btn-outline min-w-0 w-full whitespace-nowrap overflow-hidden text-ellipsis flex items-center justify-between gap-2${limitPulse ? ' ring-2 ring-primary/50 border-primary/40' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={selectionSummary.tooltip}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{selectionSummary.button}</span>
        <ChevronDownIcon className="h-4 w-4" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* Modal */}
            <div
              ref={modalRef}
              className="relative card p-6 w-full max-w-4xl max-h-[85vh] overflow-auto"
              role="dialog"
              aria-label="Choose a model"
            >
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold">Choose a Model</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-full hover:bg-muted transition-colors"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Multi-model selection indicator */}
              {enableMultiModelChat && selectedIds.length > 0 && (
                <div className="mb-4 text-xs text-muted-foreground">
                  Selected: {selectedIds.length}/{maxSelectable} models
                  {selectedIds.length >= maxSelectable && (
                    <span className="ml-2 text-amber-600">
                      (max {maxSelectable} on {isMobile ? 'mobile' : 'desktop'})
                    </span>
                  )}
                </div>
              )}

              {/* Recommended Section */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Recommended
                </h3>
                <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {CURATED_MODELS.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      isSelected={selectedIds.includes(model.id)}
                      onSelect={toggleModel}
                      modelMap={modelMap}
                      zdrLists={zdrLists}
                      numberFormatter={numberFormatter}
                    />
                  ))}
                </div>
              </div>

              {/* Favorites Section */}
              {uniqueFavorites.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Your Favorites
                  </h3>
                  <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {uniqueFavorites.map((modelId) => (
                      <FavoriteModelCard
                        key={modelId}
                        modelId={modelId}
                        isSelected={selectedIds.includes(modelId)}
                        onSelect={toggleModel}
                        onRemove={handleRemoveFavorite}
                        modelMap={modelMap}
                        zdrLists={zdrLists}
                        numberFormatter={numberFormatter}
                      />
                    ))}
                  </div>
                  <div ref={favoritesEndRef} />
                </div>
              )}

              {/* Add more models section */}
              <AddModelSearch
                onAddFavorite={handleAddFavorite}
                favoriteIds={favoriteModelIds}
                curatedIds={curatedIds}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
