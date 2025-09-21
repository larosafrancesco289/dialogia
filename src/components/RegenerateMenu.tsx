'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import { CURATED_MODELS } from '@/data/curatedModels';
import { formatModelLabel } from '@/lib/models';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function RegenerateMenu({ onChoose }: { onChoose: (modelId?: string) => void }) {
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
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const widthPx = 14 * 16; // Tailwind w-56 = 14rem (assuming 16px root)
  const margin = 8;
  const updateCoords = useMemo(
    () =>
      () => {
        const root = rootRef.current;
        if (!root) return;
        const r = root.getBoundingClientRect();
        const left = Math.min(
          Math.max(8, Math.round(r.right - widthPx)),
          Math.max(8, window.innerWidth - widthPx - 8),
        );
        const top = Math.max(8, Math.round(r.top - margin));
        setCoords({ left, top });
      },
    [],
  );
  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onScroll = () => updateCoords();
    const onResize = () => updateCoords();
    window.addEventListener('scroll', onScroll, { passive: true } as any);
    window.addEventListener('resize', onResize, { passive: true } as any);
    return () => {
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
              transform: 'translateY(-100%)', // position above trigger (bottom-full)
            }}
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
