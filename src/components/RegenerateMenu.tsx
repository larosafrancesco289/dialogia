'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import { CURATED_MODELS } from '@/data/curatedModels';
import { formatModelLabel } from '@/lib/models';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export function RegenerateMenu({ onChoose }: { onChoose: (modelId?: string) => void }) {
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { favoriteModelIds, models } = useChatStore();
  const modelMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const model of models || []) {
      map.set(model.id, model);
    }
    return map;
  }, [models]);
  const curated = [
    { id: chat?.settings.model || CURATED_MODELS[0]?.id, name: 'Current' },
    ...CURATED_MODELS,
  ];
  const customOptions = (favoriteModelIds || []).map((id) => ({ id, name: id }));
  const options = [...curated, ...customOptions].reduce((acc: any[], m: any) => {
    if (!acc.find((x) => x.id === m.id)) acc.push(m);
    return acc;
  }, []);
  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const root = rootRef.current;
      const menu = menuRef.current;
      if ((root && target && root.contains(target)) || (menu && target && menu.contains(target)))
        return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    // Close on Escape while menu/input is focused
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  // Fixed-position portal coordinates to avoid stacking-context issues
  const [coords, setCoords] = useState<{ left: number; top: number; placement: 'up' | 'down' }>({
    left: 0,
    top: 0,
    placement: 'down',
  });
  const widthPx = 14 * 16; // Tailwind w-56 = 14rem (assuming 16px root)
  const margin = 8;
  const updateCoords = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const measuredHeight = menuRef.current?.offsetHeight ?? 0;
    const estimatedHeight = measuredHeight || 224; // fallback height before first measurement
    const left = Math.min(
      Math.max(margin, Math.round(rect.right - widthPx)),
      Math.max(margin, window.innerWidth - widthPx - margin),
    );
    const spaceAbove = rect.top - margin;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const downCandidateTop = Math.round(rect.bottom + margin);
    const downMaxTop = window.innerHeight - margin - estimatedHeight;
    const downOverflow = downCandidateTop + estimatedHeight > window.innerHeight - margin;
    const upCandidateTop = Math.round(rect.top - margin - estimatedHeight);
    const upOverflow = upCandidateTop < margin;
    let placement: 'up' | 'down';
    if (downOverflow && !upOverflow) placement = 'up';
    else if (upOverflow && !downOverflow) placement = 'down';
    else placement = spaceBelow >= spaceAbove ? 'down' : 'up';
    let top = placement === 'down' ? downCandidateTop : upCandidateTop;
    if (placement === 'down') {
      top = Math.min(Math.max(margin, top), downMaxTop);
      if (top < margin && !upOverflow) {
        placement = 'up';
        top = Math.max(margin, Math.round(rect.top - margin - estimatedHeight));
      }
    }
    if (placement === 'up') {
      const upTop = Math.max(margin, Math.round(rect.top - margin - estimatedHeight));
      if (upTop + estimatedHeight > rect.top - margin && !downOverflow) {
        placement = 'down';
        top = Math.min(Math.max(margin, downCandidateTop), downMaxTop);
      } else {
        top = upTop;
      }
    }
    // After the menu has measured, re-clamp using the actual height to keep within viewport
    if (measuredHeight) {
      if (placement === 'down') {
        const maxTop = window.innerHeight - margin - measuredHeight;
        top = Math.min(Math.max(margin, downCandidateTop), maxTop);
      } else {
        top = Math.max(margin, Math.round(rect.top - margin - measuredHeight));
      }
    }
    const clampHeight = measuredHeight || estimatedHeight;
    const maxTopFinal = window.innerHeight - margin - clampHeight;
    top = Math.min(top, maxTopFinal);
    top = Math.max(margin, top);
    setCoords({ left, top, placement });
  }, []);
  useEffect(() => {
    if (!open) return;
    updateCoords();
    const raf = requestAnimationFrame(() => updateCoords());
    const onScroll = () => updateCoords();
    const onResize = () => updateCoords();
    window.addEventListener('scroll', onScroll, { passive: true } as any);
    window.addEventListener('resize', onResize, { passive: true } as any);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll as any);
      window.removeEventListener('resize', onResize as any);
    };
  }, [open, updateCoords]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        className="icon-button"
        aria-label="Regenerate"
        title="Regenerate"
        onClick={() =>
          setOpen((v) => {
            if (!v) updateCoords();
            return !v;
          })
        }
      >
        <ArrowPathIcon className="h-5 w-5 sm:h-4 sm:w-4" />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed card p-2 w-56"
            style={{
              zIndex: 80,
              left: coords.left,
              top: coords.top,
            }}
            data-placement={coords.placement}
            role="menu"
            aria-label="Regenerate options"
            ref={menuRef}
          >
            <div className="text-xs text-muted-foreground px-1 pb-1">Choose model</div>
            {options.map((o) => {
              const label = formatModelLabel({
                model: modelMap.get(o.id),
                fallbackId: o.id,
                fallbackName: o.name,
              });
              return (
                <div
                  key={o.id}
                  className="menu-item text-sm"
                  onClick={() => {
                    onChoose(o.id);
                    setOpen(false);
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
