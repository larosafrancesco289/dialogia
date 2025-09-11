'use client';
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { CURATED_MODELS } from '@/data/curatedModels';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function RegenerateMenu({ onChoose }: { onChoose: (modelId?: string) => void }) {
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [custom, setCustom] = useState('');
  const { favoriteModelIds } = useChatStore();
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
      if (root && target && root.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        className="icon-button"
        aria-label="Regenerate"
        title="Regenerate"
        onClick={() => setOpen((v) => !v)}
      >
        <ArrowPathIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-2 z-40 card p-2 w-56 popover">
          <div className="text-xs text-muted-foreground px-1 pb-1">Choose model</div>
          {options.map((o) => (
            <div
              key={o.id}
              className="menu-item text-sm"
              onClick={() => {
                onChoose(o.id);
                setOpen(false);
              }}
            >
              {o.name || o.id}
            </div>
          ))}
          <div className="border-t border-border my-1" />
          <div className="flex gap-1">
            <input
              className="input flex-1"
              placeholder="provider/model-id"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const id = custom.trim();
                  if (id) {
                    onChoose(id);
                    setCustom('');
                    setOpen(false);
                  }
                }
              }}
            />
            <button
              className="btn btn-outline"
              onClick={() => {
                const id = custom.trim();
                if (id) {
                  onChoose(id);
                  setCustom('');
                  setOpen(false);
                }
              }}
            >
              Go
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
