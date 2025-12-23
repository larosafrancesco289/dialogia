'use client';

import type { KeyboardEvent } from 'react';
import {
  CheckIcon,
  EyeIcon,
  LightBulbIcon,
  PhotoIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { describeModelPricing } from '@/lib/cost';
import { evaluateZdrModel } from '@/lib/policy/zdr';
import type { ZdrLists } from '@/lib/policy/zdr';
import { findModelById, formatModelLabel, getModelCapabilities } from '@/lib/models';
import { getModelTransportLabel } from '@/lib/providers';
import type { CuratedModel } from '@/data/curatedModels';

export function ModelCard({
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

export function FavoriteModelCard({
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
