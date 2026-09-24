import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { formatModelLabel } from '@/lib/models';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useCuratedModels, useDefaultModelId } from '@/lib/hooks/useModelCatalog';
import type { ModelDescriptor } from '@/lib/types';
import { useMenuKeyboard } from '@/lib/hooks/useMenuKeyboard';

export function RegenerateMenu({
  onChoose,
  disabled = false,
}: {
  onChoose: (modelId?: string) => void;
  disabled?: boolean;
}) {
  const { chat, favoriteModelIds, models } = useChatStore(
    (s) => ({
      chat: s.selectedChatId ? s.chats.find((c) => c.id === s.selectedChatId) : undefined,
      favoriteModelIds: s.favoriteModelIds,
      models: s.models,
    }),
    shallow,
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  // Focus on the first model, arrows between them, Escape back to the button.
  const onMenuKeyDown = useMenuKeyboard({ open, menuRef, onClose: closeMenu, triggerRef });
  const curatedModels = useCuratedModels();
  const defaultModelId = useDefaultModelId();
  const modelMap = useMemo(() => {
    const map = new Map<string, ModelDescriptor>();
    for (const model of models || []) {
      map.set(model.id, model);
    }
    return map;
  }, [models]);
  const currentId = chat?.settings.modelId || curatedModels[0]?.id || defaultModelId;
  const curated = [{ id: currentId, name: currentId }, ...curatedModels];
  const customOptions = (favoriteModelIds || []).map((id) => ({ id, name: id }));
  type ModelOption = { id: string; name: string };
  const options = [...curated, ...customOptions].reduce<ModelOption[]>((acc, m) => {
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
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  // Fixed-position portal coordinates to avoid stacking-context issues
  const [coords, setCoords] = useState<{ left: number; top: number; placement: 'up' | 'down' }>({
    left: 0,
    top: 0,
    placement: 'down',
  });
  const widthPx = 15 * 16; // w-60 = 15rem (assuming 16px root)
  const margin = 8;
  const updateCoords = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const measuredHeight = menuRef.current?.offsetHeight ?? 0;
    const estimatedHeight = measuredHeight || 224; // fallback height before first measurement
    // The button sits at the start of the reply's footer: open from its left
    // edge, clamped to the viewport.
    const left = Math.min(
      Math.max(margin, Math.round(rect.left)),
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
  }, [margin, widthPx]);
  useEffect(() => {
    if (!open) return;
    updateCoords();
    const raf = requestAnimationFrame(() => updateCoords());
    const onScroll = () => updateCoords();
    const onResize = () => updateCoords();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateCoords]);

  return (
    <div className="inline-flex" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="message-action-btn"
        aria-label="Try again"
        title="Try again"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() =>
          setOpen((v) => {
            if (!v) updateCoords();
            return !v;
          })
        }
      >
        <ArrowPathIcon className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            className="popover fixed p-1 w-60"
            style={{
              zIndex: 80,
              left: coords.left,
              top: coords.top,
            }}
            data-placement={coords.placement}
            role="menu"
            aria-label="Regenerate options"
            ref={menuRef}
            onKeyDown={onMenuKeyDown}
          >
            <div className="menu-heading">Try again with</div>
            {options.map((o) => {
              const label = formatModelLabel({
                model: modelMap.get(o.id),
                fallbackId: o.id,
                fallbackName: o.name,
              });
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitem"
                  className="menu-item w-full text-left text-sm"
                  onClick={() => {
                    onChoose(o.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{label}</span>
                    {o.id === currentId && (
                      <span className="text-xs text-fg-muted">same model</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
