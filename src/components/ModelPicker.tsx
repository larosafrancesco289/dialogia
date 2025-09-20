'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
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
} from '@heroicons/react/24/outline';
import { CURATED_MODELS } from '@/data/curatedModels';
import { PINNED_MODEL_ID, DEFAULT_MODEL_ID } from '@/lib/constants';
import {
  findModelById,
  isReasoningSupported,
  isVisionSupported,
  isAudioInputSupported,
  isImageOutputSupported,
} from '@/lib/models';
import { describeModelPricing } from '@/lib/cost';
import { shallow } from 'zustand/shallow';
import type { Chat } from '@/lib/types';

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
  choose: (modelId: string) => void;
  removeModelFromDropdown: (id: string) => void;
  modelMap: Map<string, ReturnType<typeof findModelById>>;
  ui: ReturnType<typeof useChatStore.getState>['ui'];
  zdrModelIds?: string[];
  zdrProviderIds?: string[];
};

function stripProvider(label?: string) {
  return String(label ?? '').replace(/^[^:]+:\s*/, '');
}

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

  const customOptions = useMemo(() => {
    const allowed = new Set((models || []).map((m: any) => m.id));
    return (favoriteModelIds || [])
      .filter((id: string) => allowed.has(id))
      .map((id: string) => ({ id, name: id }));
  }, [favoriteModelIds, models]);

  const allOptions = useMemo(() => {
    const injectedDefault = [{ id: DEFAULT_MODEL_ID, name: 'Kimi K2' }];
    return [...injectedDefault, ...curated, ...customOptions].reduce((acc: Option[], m: Option) => {
      if (!acc.find((x) => x.id === m.id)) acc.push(m);
      return acc;
    }, []);
  }, [customOptions]);

  const options = useMemo(() => {
    const hidden = new Set(hiddenModelIds || []);
    const allowedIds = new Set((models || []).map((m: any) => m.id));
    return allOptions.filter((m: Option) => {
      if (m.id === PINNED_MODEL_ID) return true;
      if (hidden.has(m.id)) return false;
      if (ui?.zdrOnly !== false) return allowedIds.has(m.id);
      return true;
    });
  }, [allOptions, hiddenModelIds, models, ui?.zdrOnly]);

  const selectedId: string | undefined = chat?.settings.model ?? ui?.nextModel;
  const allowedIds = new Set((models || []).map((m: any) => m.id));
  const effectiveSelectedId =
    ui?.zdrOnly !== false && selectedId && !allowedIds.has(selectedId) ? undefined : selectedId;
  const current =
    allOptions.find((o) => o.id === effectiveSelectedId) ||
    (effectiveSelectedId ? { id: effectiveSelectedId, name: effectiveSelectedId } : undefined) ||
    options[0];

  const choose = (modelId: string) => {
    if (chat) {
      updateChatSettings({ model: modelId });
    } else {
      setUI({ nextModel: modelId });
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
    choose,
    removeModelFromDropdown,
    modelMap,
    ui,
    zdrModelIds,
    zdrProviderIds,
  };
}

export default function ModelPicker({
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
    choose,
    removeModelFromDropdown,
    modelMap,
    zdrModelIds,
    zdrProviderIds,
  } = useModelPickerController();

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const [popoverPos, setPopoverPos] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const handleChoose = (id: string) => {
    choose(id);
    setOpen(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setPopoverPos(null);
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
    const updateWidth = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const margin = 12;
      const gap = 8;
      const triggerW = rect.width;
      const minWidth = variant === 'sheet' ? 280 : 320;
      const minHeight = variant === 'sheet' ? 260 : 220;
      const baseWidth = Math.max(triggerW, minWidth);
      const width = Math.min(viewportW - margin * 2, baseWidth);
      const left = Math.min(Math.max(rect.left, margin), viewportW - width - margin);
      const top = rect.bottom + gap;
      const maxHeight = Math.max(minHeight, viewportH - top - margin);
      setPopoverPos({ left, top, width, maxHeight });
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    window.addEventListener('scroll', updateWidth, true);
    const idx = Math.max(
      0,
      options.findIndex((o) => o.id === (current?.id || '')),
    );
    setHighlightedIndex(idx === -1 ? 0 : idx);
    const timer = window.setTimeout(() => listboxRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('resize', updateWidth);
      window.removeEventListener('scroll', updateWidth, true);
      window.clearTimeout(timer);
    };
  }, [open, options, current?.id, variant]);

  const title = stripProvider(current?.name || current?.id) || 'Pick model';

  const renderCapabilities = (id: string) => {
    const meta = modelMap.get(id);
    const canReason = isReasoningSupported(meta);
    const canSee = isVisionSupported(meta);
    const canAudio = isAudioInputSupported(meta);
    const canImageOut = isImageOutputSupported(meta);
    const provider = String(id).split('/')[0];
    const isZdr = Boolean(
      (zdrModelIds && zdrModelIds.includes(id)) ||
      (zdrProviderIds && zdrProviderIds.includes(provider)),
    );
    const priceStr = describeModelPricing(meta);
    return { canReason, canSee, canAudio, canImageOut, isZdr, priceStr };
  };

  return (
    <div className={`relative min-w-0 ${className}`.trim()} ref={rootRef}>
      <button
        className="btn btn-outline min-w-0 w-full whitespace-nowrap overflow-hidden text-ellipsis flex items-center justify-between gap-2"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{title}</span>
        <ChevronDownIcon className="h-4 w-4" />
      </button>

      {open && popoverPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listboxRef}
            className="card p-2 overflow-auto popover z-[90] fixed"
            style={{
              left: popoverPos.left,
              top: popoverPos.top,
              width: popoverPos.width,
              maxHeight: popoverPos.maxHeight,
            }}
            role="listbox"
            aria-label="Select a model"
            aria-activedescendant={`model-opt-${highlightedIndex}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex((i) => (i + 1) % Math.max(1, options.length));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex(
                  (i) => (i - 1 + Math.max(1, options.length)) % Math.max(1, options.length),
                );
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const target = options[highlightedIndex];
                if (target) handleChoose(target.id);
                return;
              }
            }}
          >
            {options.map((o, idx) => {
              const { canReason, canSee, canAudio, canImageOut, isZdr, priceStr } = renderCapabilities(o.id);
              const showPrice = variant !== 'sheet';
              return (
                <div
                  key={o.id}
                  id={`model-opt-${idx}`}
                  role="option"
                  aria-selected={o.id === selectedId}
                  className={`menu-item flex items-center justify-between gap-2 ${
                    o.id === selectedId ? 'bg-muted' : ''
                  } ${idx === highlightedIndex ? 'ring-1 ring-border' : ''}`}
                  onClick={() => handleChoose(o.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-sm">{stripProvider(o.name || o.id)}</div>
                    <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                      {canReason && <LightBulbIcon className="h-4 w-4" title="Reasoning" />}
                      {canSee && <EyeIcon className="h-4 w-4" title="Vision input" />}
                      {canAudio && <MicrophoneIcon className="h-4 w-4" title="Audio input" />}
                      {canImageOut && <PhotoIcon className="h-4 w-4" title="Image generation" />}
                      {isZdr && <ShieldCheckIcon className="h-4 w-4" title="Zero Data Retention" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {showPrice && priceStr && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {priceStr}
                      </span>
                    )}
                    {o.id !== PINNED_MODEL_ID && (
                      <button
                        className="p-1 rounded hover:bg-muted"
                        title="Hide from dropdown"
                        aria-label="Hide model from dropdown"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeModelFromDropdown(o.id);
                        }}
                      >
                        <XMarkIcon className="h-4 w-4 opacity-60 hover:opacity-100" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
