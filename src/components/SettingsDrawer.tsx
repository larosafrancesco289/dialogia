"use client";
import { useChatStore } from "@/lib/store";
import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

export default function SettingsDrawer() {
  const { chats, selectedChatId, updateChatSettings, setUI, loadModels, toggleFavoriteModel, favoriteModelIds, models } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId)!;
  const [system, setSystem] = useState(chat.settings.system ?? "");
  const [temperature, setTemperature] = useState<number | undefined>(chat.settings.temperature);
  const [top_p, setTopP] = useState<number | undefined>(chat.settings.top_p);
  const [max_tokens, setMaxTokens] = useState<number | undefined>(chat.settings.max_tokens);
  const [customModel, setCustomModel] = useState("");
  const [query, setQuery] = useState("");

  // Prevent background scroll while drawer is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  // Load models for autocomplete on mount (if key configured)
  useEffect(() => { loadModels(); }, [loadModels]);

  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");
  const filtered = useMemo(() => {
    if (!normalizedQuery) return [] as { id: string; name?: string }[];
    const words = normalizedQuery.split(" ");
    return (models || [])
      .filter((m) => {
        const hay = `${m.id} ${m.name ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 50)
      .map((m) => ({ id: m.id, name: m.name }));
  }, [models, normalizedQuery]);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setUI({ showSettings: false })} />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-surface border-l border-border p-4 space-y-4 shadow-[var(--shadow-card)] z-50 overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Settings</h3>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button className="btn btn-ghost" onClick={() => setUI({ showSettings: false })}>Close</button>
        </div>
      </div>
        <div className="space-y-2">
          <label className="text-sm">System prompt</label>
          <textarea className="input w-full h-32" value={system} onChange={(e) => setSystem(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-sm flex items-center justify-between">
              <span>Temperature</span>
              <button className="btn btn-ghost text-xs" onClick={() => setTemperature(undefined)}>Use default</button>
            </label>
            <input
              className="input w-full"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature ?? ""}
              placeholder="model default"
              onChange={(e) => setTemperature(e.target.value === "" ? undefined : parseFloat(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm flex items-center justify-between">
              <span>Top_p</span>
              <button className="btn btn-ghost text-xs" onClick={() => setTopP(undefined)}>Use default</button>
            </label>
            <input
              className="input w-full"
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={top_p ?? ""}
              placeholder="model default"
              onChange={(e) => setTopP(e.target.value === "" ? undefined : parseFloat(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm flex items-center justify-between">
              <span>Max tokens</span>
              <button className="btn btn-ghost text-xs" onClick={() => setMaxTokens(undefined)}>Auto</button>
            </label>
            <input
              className="input w-full"
              type="number"
              step="1"
              min="1"
              value={max_tokens ?? ""}
              placeholder="auto"
              onChange={(e) => setMaxTokens(e.target.value === "" ? undefined : parseInt(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="text-sm">Add custom model ID</label>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="provider/model-id" value={customModel} onChange={(e) => setCustomModel(e.target.value)} />
            <button
              className="btn btn-outline"
              onClick={() => {
                const id = customModel.trim();
                if (!id) return;
                if (!favoriteModelIds.includes(id)) toggleFavoriteModel(id);
                updateChatSettings({ model: id });
                setCustomModel("");
              }}
            >
              Add
            </button>
          </div>
          <div className="relative">
            <input
              className="input w-full mt-2"
              placeholder="Search OpenRouter models (e.g. openai, anthropic, llama)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {normalizedQuery && (
              <div className="absolute left-0 right-0 top-full mt-2 card p-2 max-h-72 overflow-auto z-10">
                {filtered.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground">No matches</div>
                )}
                {filtered.map((m) => (
                  <div key={m.id} className="p-2 rounded hover:bg-muted cursor-pointer flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{m.name || m.id}</div>
                      {m.name && <div className="text-xs text-muted-foreground">{m.id}</div>}
                    </div>
                    <button
                      className="btn btn-outline text-sm"
                      onClick={() => {
                        if (!favoriteModelIds.includes(m.id)) toggleFavoriteModel(m.id);
                        updateChatSettings({ model: m.id });
                        setQuery("");
                      }}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <button className="btn btn-ghost" onClick={() => loadModels()}>Refresh model list</button>
          </div>
        </div>
      <div className="pt-2">
        <button
          className="btn"
          onClick={() => {
            updateChatSettings({ system, temperature, top_p, max_tokens });
            setUI({ showSettings: false });
          }}
        >
          Save
        </button>
      </div>
      </div>
    </>
  );
}


