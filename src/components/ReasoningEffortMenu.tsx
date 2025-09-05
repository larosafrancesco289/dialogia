'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { LightBulbIcon } from '@heroicons/react/24/outline';
import { findModelById, isReasoningSupported } from '@/lib/models';
import { DEFAULT_MODEL_ID } from '@/lib/constants';

type Effort = 'none' | 'low' | 'medium' | 'high';

export default function ReasoningEffortMenu() {
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const models = useChatStore((s) => s.models);
  const updateSettings = useChatStore((s) => s.updateChatSettings);
  const ui = useChatStore((s) => s.ui);
  const setUI = useChatStore((s) => s.setUI);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const modelId = chat?.settings.model || ui.nextModel || DEFAULT_MODEL_ID;
  const selectedModel = useMemo(() => findModelById(models, modelId), [models, modelId]);
  const supportsReasoning = useMemo(() => isReasoningSupported(selectedModel), [selectedModel]);

  const current: Effort | undefined = (
    chat ? (chat.settings.reasoning_effort as any) : (ui.nextReasoningEffort as any)
  ) as Effort | undefined;
  const active = current && current !== 'none';

  const choose = async (effort: Effort) => {
    if (chat) await updateSettings({ reasoning_effort: effort });
    else setUI({ nextReasoningEffort: effort });
    setOpen(false);
  };

  // Close when clicking outside (must be declared unconditionally)
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

  if (!supportsReasoning) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        className={`btn self-center ${active ? 'btn-primary' : 'btn-outline'}`}
        onClick={() => setOpen((v) => !v)}
        title={'Set reasoning effort'}
        aria-label="Set reasoning effort"
        aria-expanded={open}
      >
        <LightBulbIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-2 z-40 card p-2 w-44 popover">
          <div className="text-xs text-muted-foreground px-1 pb-1">Reasoning effort</div>
          {(
            [
              { key: 'none', label: 'None' },
              { key: 'low', label: 'Low' },
              { key: 'medium', label: 'Medium' },
              { key: 'high', label: 'High' },
            ] as const
          ).map((o) => (
            <div
              key={o.key}
              className={`menu-item text-sm ${current === o.key ? 'font-semibold' : ''}`}
              onClick={() => choose(o.key)}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
