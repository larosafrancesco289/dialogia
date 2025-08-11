'use client';
import { useMemo, useState } from 'react';
import { useChatStore } from '@/lib/store';

export default function ModelPicker() {
  const { updateChatSettings, chats, selectedChatId, ui, setUI, favoriteModelIds } =
    useChatStore() as any;
  const chat = chats.find((c: any) => c.id === selectedChatId);
  const curated = [
    { id: 'openai/gpt-5-chat', name: 'GPT-5' },
    { id: 'moonshotai/kimi-k2', name: 'Kimi K2' },
    { id: 'x-ai/grok-4', name: 'Grok 4' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  ];
  const customOptions = useMemo(
    () => (favoriteModelIds || []).map((id: string) => ({ id, name: id })),
    [favoriteModelIds],
  );
  const options = useMemo(() => {
    return [...curated, ...customOptions].reduce((acc: any[], m: any) => {
      if (!acc.find((x) => x.id === m.id)) acc.push(m);
      return acc;
    }, []);
  }, [customOptions]);
  const [open, setOpen] = useState(false);
  const selectedId: string | undefined = chat?.settings.model ?? ui?.nextModel;
  const current = options.find((o) => o.id === selectedId) || options[0];
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
        <div className="absolute z-20 mt-2 w-64 card p-2 max-h-72 overflow-auto">
          {options.map((o) => (
            <div
              key={o.id}
              className={`p-2 rounded cursor-pointer ${o.id === selectedId ? 'bg-muted' : ''}`}
              onClick={() => choose(o.id)}
            >
              {o.name || o.id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
