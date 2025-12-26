'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { formatModelLabel } from '@/lib/models';
import { useTierCuratedModels } from '@/lib/hooks/useTierModels';
import { useTier } from '@/lib/auth/tierContext';
import { FREE_MODEL_IDS } from '@/data/freeModels';
import type { ZdrLists } from '@/lib/policy/zdr';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { getModelTransportLabel } from '@/lib/providers';
import { ModelSearch, type ModelSearchResult } from '@/components/ModelSearch';
import { PortalDropdown } from '@/components/PortalDropdown';
import { FavoriteModelCard, ModelCard } from '@/components/modelPicker/ModelCards';
import {
  useModelPickerController,
  type ModelPickerOption,
} from '@/components/modelPicker/useModelPickerController';

export type ModelPickerVariant = 'auto' | 'sheet';

function AddModelSearch({
  onAddFavorite,
  favoriteIds,
  curatedIds,
  dropdownRef,
}: {
  onAddFavorite: (result: ModelSearchResult) => void;
  favoriteIds: string[];
  curatedIds: string[];
  dropdownRef?: RefObject<HTMLDivElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  const alreadyAddedIds = useMemo(() => [...favoriteIds, ...curatedIds], [favoriteIds, curatedIds]);

  return (
    <div className="border-t border-border/50 pt-5 mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full transition-colors"
      >
        {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
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
            dropdownRef={dropdownRef}
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

  const curatedModels = useTierCuratedModels();
  const { isFreeTier, isLoading: tierLoading } = useTier();

  const zdrLists = useMemo<ZdrLists>(
    () => ({
      modelIds: new Set(zdrModelIds || []),
      providerIds: new Set(zdrProviderIds || []),
    }),
    [zdrModelIds, zdrProviderIds],
  );

  const curatedIds = useMemo(() => curatedModels.map((m) => m.id), [curatedModels]);

  // Filter out favorites that are already in curated list
  // Also filter out paid models for free tier users
  const uniqueFavorites = useMemo(() => {
    const curatedSet = new Set(curatedIds);
    return favoriteModelIds.filter((id) => {
      if (curatedSet.has(id)) return false;
      // For free tier, only show favorites that are free models
      if (!tierLoading && isFreeTier && !FREE_MODEL_IDS.includes(id)) return false;
      return true;
    });
  }, [favoriteModelIds, curatedIds, isFreeTier, tierLoading]);

  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const searchDropdownRef = useRef<HTMLDivElement | null>(null);
  const favoritesEndRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const maxSelectable = enableMultiModelChat ? (isMobile ? 2 : 4) : 1;
  const limitTimeoutRef = useRef<number | null>(null);
  const [limitPulse, setLimitPulse] = useState(false);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);

  const deriveLabel = useCallback(
    (opt?: ModelPickerOption) => {
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
      // Clean display: just the model name, no provider
      return { button: labels[0], tooltip: labels[0] };
    }
    // Multiple models: show first + count
    const button = `${labels[0]} +${labels.length - 1}`;
    const tooltip = labels.join(', ');
    return { button, tooltip };
  }, [selectedIds, deriveLabel, modelMap, current]);

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

      <PortalDropdown
        open={open}
        onClose={() => setOpen(false)}
        contentRef={modalRef}
        ignoreOutsideRefs={[searchDropdownRef]}
      >
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

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
                {curatedModels.map((model) => (
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
              dropdownRef={searchDropdownRef}
            />
          </div>
        </div>
      </PortalDropdown>
    </div>
  );
}
