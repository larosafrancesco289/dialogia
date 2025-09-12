'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import {
  XMarkIcon,
  EyeIcon,
  LightBulbIcon,
  MicrophoneIcon,
  ShieldCheckIcon,
  PhotoIcon,
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

export default function ModelPicker() {
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
  } = useChatStore();
  const chat = chats.find((c: any) => c.id === selectedChatId);
  const zdrModelIds = useChatStore((s) => s.zdrModelIds);
  const zdrProviderIds = useChatStore((s) => s.zdrProviderIds);
  const curated = CURATED_MODELS;
  const customOptions = useMemo(() => {
    const allowed = new Set((models || []).map((m: any) => m.id));
    return (favoriteModelIds || [])
      .filter((id: string) => allowed.has(id))
      .map((id: string) => ({ id, name: id }));
  }, [favoriteModelIds, models]);
  const allOptions = useMemo(() => {
    // Ensure DEFAULT_MODEL_ID is always present as a selectable option
    const injectedDefault = (() => {
      const meta = findModelById(models, DEFAULT_MODEL_ID);
      const display = meta?.name || DEFAULT_MODEL_ID;
      return [{ id: DEFAULT_MODEL_ID, name: display }];
    })();
    return [...injectedDefault, ...curated, ...customOptions].reduce((acc: any[], m: any) => {
      if (!acc.find((x) => x.id === m.id)) acc.push(m);
      return acc;
    }, []);
  }, [customOptions, models]);
  const options = useMemo(() => {
    const hidden = new Set(hiddenModelIds || []);
    const allowedIds = new Set((models || []).map((m: any) => m.id));
    return allOptions.filter((m: any) => {
      if (m.id === PINNED_MODEL_ID) return true;
      if (hidden.has(m.id)) return false;
      // When ZDR-only is on, restrict to models currently allowed/listed
      if (ui?.zdrOnly !== false) return allowedIds.has(m.id);
      return true;
    });
  }, [allOptions, hiddenModelIds, models, ui?.zdrOnly]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [listWidth, setListWidth] = useState<number | undefined>(undefined);
  const isSmall = typeof window !== 'undefined' && window.innerWidth < 640;
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
    setOpen(false);
  };
  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const root = rootRef.current;
      if (root && target && root.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  // When opening, initialize highlighted index to current selection
  useEffect(() => {
    if (open) {
      // Compute width. On small screens, use nearly full width; desktop grows with trigger.
      const updateWidth = () => {
        const r = rootRef.current?.getBoundingClientRect();
        const triggerW = r?.width || 0;
        const small = typeof window !== 'undefined' && window.innerWidth < 640;
        // Mobile: use almost-full width; Desktop: match trigger width (no hard cap)
        const w = small ? Math.min(window.innerWidth - 24, 560) : Math.max(triggerW, 360);
        setListWidth(Math.round(w));
      };
      updateWidth();
      window.addEventListener('resize', updateWidth, { passive: true });
      const idx = Math.max(
        0,
        options.findIndex((o) => o.id === (current?.id || '')),
      );
      setHighlightedIndex(idx === -1 ? 0 : idx);
      // focus the listbox for keyboard navigation
      setTimeout(() => listboxRef.current?.focus(), 0);
      return () => window.removeEventListener('resize', updateWidth as any);
    }
  }, [open, options, current?.id]);

  const stripProvider = (s?: string) => String(s || '').replace(/^[^:]+:\\s*/, '');

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        className="btn btn-outline min-w-0 w-full whitespace-nowrap overflow-hidden text-ellipsis"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={stripProvider(current?.name || current?.id) || 'Pick model'}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {stripProvider(current?.name || current?.id) || 'Pick model'}
      </button>
      {open && (
        <div className="absolute z-20 mt-2 model-pop-wrap">
          <div
            ref={listboxRef}
            className="card p-2 max-h-80 overflow-auto popover"
            style={{ width: listWidth }}
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
               if (target) choose(target.id);
               return;
             }
            }}
          >
          {options.map((o, idx) => {
            const meta = findModelById(models, o.id);
            const canReason = isReasoningSupported(meta);
            const canSee = isVisionSupported(meta);
            const canAudio = isAudioInputSupported(meta);
            const canImageOut = isImageOutputSupported(meta);
            const priceStr = describeModelPricing(meta);
            const provider = String(o.id).split('/')[0];
            const isZdr = Boolean(
              (zdrModelIds && zdrModelIds.includes(o.id)) ||
                (zdrProviderIds && zdrProviderIds.includes(provider)),
            );
            return (
              <div
                key={o.id}
                id={`model-opt-${idx}`}
                role="option"
                aria-selected={o.id === selectedId}
                className={`menu-item flex items-center justify-between gap-2 ${
                  o.id === selectedId ? 'bg-muted' : ''
                } ${idx === highlightedIndex ? 'ring-1 ring-border' : ''}`}
                onClick={() => choose(o.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">{stripProvider(o.name || o.id)}</div>
                  <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                    {canReason && (
                      <LightBulbIcon
                        className="h-4 w-4"
                        aria-label="Reasoning supported"
                        title="Reasoning supported"
                      />
                    )}
                    {canSee && (
                      <EyeIcon className="h-4 w-4" aria-label="Vision input" title="Vision input" />
                    )}
                    {canAudio && (
                      <MicrophoneIcon
                        className="h-4 w-4"
                        aria-label="Audio input"
                        title="Audio input"
                      />
                    )}
                    {canImageOut && (
                      <PhotoIcon
                        className="h-4 w-4"
                        aria-label="Image generation"
                        title="Image generation"
                      />
                    )}
                    {isZdr && (
                      <ShieldCheckIcon
                        className="h-4 w-4"
                        aria-label="Zero Data Retention"
                        title="Zero Data Retention"
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {priceStr && (
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
          </div>
        </div>
      )}
    </div>
  );
}
