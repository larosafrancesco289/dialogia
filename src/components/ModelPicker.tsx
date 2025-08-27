'use client';
import { useMemo, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { CURATED_MODELS } from '@/data/curatedModels';
import { PINNED_MODEL_ID } from '@/lib/constants';

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
  const curated = CURATED_MODELS;
  const customOptions = useMemo(() => {
    const allowed = new Set((models || []).map((m: any) => m.id));
    return (favoriteModelIds || [])
      .filter((id: string) => allowed.has(id))
      .map((id: string) => ({ id, name: id }));
  }, [favoriteModelIds, models]);
  const allOptions = useMemo(() => {
    return [...curated, ...customOptions].reduce((acc: any[], m: any) => {
      if (!acc.find((x) => x.id === m.id)) acc.push(m);
      return acc;
    }, []);
  }, [customOptions]);
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
  const selectedId: string | undefined = chat?.settings.model ?? ui?.nextModel;
  const allowedIds = new Set((models || []).map((m: any) => m.id));
  const effectiveSelectedId = ui?.zdrOnly !== false && selectedId && !allowedIds.has(selectedId)
    ? undefined
    : selectedId;
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
