'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { LightBulbIcon } from '@heroicons/react/24/outline';
import { findModelById, isReasoningSupported } from '@/lib/models';
import { useTierDefaultModelId } from '@/lib/hooks/useTierModels';
import {
  selectNextOverrides,
  selectResolvedModelId,
  selectResolvedTurnSettings,
} from '@/lib/store/selectors';

type Effort = 'none' | 'low' | 'medium' | 'high';

export function ReasoningEffortMenu() {
  const { chat, models, updateSettings, setUI, nextOverrides } = useChatStore(
    (s) => ({
      chat: s.selectedChatId ? s.chats.find((c) => c.id === s.selectedChatId) : undefined,
      models: s.models,
      updateSettings: s.updateChatSettings,
      setUI: s.setUI,
      nextOverrides: selectNextOverrides(s),
    }),
    shallow,
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const tierDefaultModelId = useTierDefaultModelId();
  const modelId = useChatStore(
    useMemo(() => selectResolvedModelId(tierDefaultModelId), [tierDefaultModelId]),
  );
  const selectedModel = useMemo(() => findModelById(models, modelId), [models, modelId]);
  const supportsReasoning = useMemo(() => isReasoningSupported(selectedModel), [selectedModel]);

  const resolvedTurnSettings = useChatStore(selectResolvedTurnSettings);
  const current: Effort | undefined =
    resolvedTurnSettings?.generation.reasoningEffort ?? nextOverrides.reasoning?.effort;
  const active = current && current !== 'none';

  const choose = async (effort: Effort) => {
    if (chat) {
      await updateSettings({
        generation: {
          reasoningEffort: effort,
          ...(effort === 'none' ? { reasoningTokens: undefined } : {}),
        },
      });
    } else {
      setUI({
        overrides: {
          reasoning: {
            effort,
            ...(effort === 'none' ? { tokens: undefined } : {}),
          },
        },
      });
    }
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
        <div className="absolute right-0 bottom-full mb-2 z-40 card p-2 w-52 popover">
          <div className="text-xs text-muted-foreground px-1 pb-1">Reasoning</div>
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
