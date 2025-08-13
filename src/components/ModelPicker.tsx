'use client';
import { useMemo, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { XMarkIcon } from '@heroicons/react/24/outline';

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
  } = useChatStore() as any;
  const chat = chats.find((c: any) => c.id === selectedChatId);
  const curated = [
    { id: 'openai/gpt-5-chat', name: 'GPT-5' },
    { id: 'moonshotai/kimi-k2', name: 'Kimi K2' },
    { id: 'x-ai/grok-4', name: 'Grok 4' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  ];
  const PINNED_MODEL_ID = 'openai/gpt-5-chat';
  const customOptions = useMemo(
    () => (favoriteModelIds || []).map((id: string) => ({ id, name: id })),
    [favoriteModelIds],
  );
  const allOptions = useMemo(() => {
    return [...curated, ...customOptions].reduce((acc: any[], m: any) => {
      if (!acc.find((x) => x.id === m.id)) acc.push(m);
      return acc;
    }, []);
  }, [customOptions]);
  const options = useMemo(() => {
    const hidden = new Set(hiddenModelIds || []);
    return allOptions.filter((m: any) => m.id === PINNED_MODEL_ID || !hidden.has(m.id));
  }, [allOptions, hiddenModelIds]);
  const [open, setOpen] = useState(false);
  const selectedId: string | undefined = chat?.settings.model ?? ui?.nextModel;
  const current =
    allOptions.find((o) => o.id === selectedId) ||
    (selectedId ? { id: selectedId, name: selectedId } : undefined) ||
    options[0];
  const choose = (modelId: string) => {
    if (chat) {
      updateChatSettings({ model: modelId });
    } else {
      setUI({ nextModel: modelId });
    }
    setOpen(false);
  };
  return (
    <div className="relative">
      <button className="btn btn-outline" onClick={() => setOpen(!open)}>
        {current?.name || current?.id}
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 card p-2 max-h-72 overflow-auto popover">
          {options.map((o) => (
            <div
              key={o.id}
              className={`menu-item flex items-center justify-between gap-2 ${o.id === selectedId ? 'bg-muted' : ''}`}
              onClick={() => choose(o.id)}
            >
              <div className="truncate">{o.name || o.id}</div>
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
          ))}
        </div>
      )}
    </div>
  );
}
