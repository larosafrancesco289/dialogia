"use client";
import { useChatStore } from "@/lib/store";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ThemeToggle from "@/components/ThemeToggle";

export default function SettingsDrawer() {
  const { chats, selectedChatId, updateChatSettings, setUI, loadModels, toggleFavoriteModel, favoriteModelIds, models } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [system, setSystem] = useState(chat?.settings.system ?? "");
  const [temperature, setTemperature] = useState<number | undefined>(chat?.settings.temperature);
  const [top_p, setTopP] = useState<number | undefined>(chat?.settings.top_p);
  const [max_tokens, setMaxTokens] = useState<number | undefined>(chat?.settings.max_tokens);
  const [customModel, setCustomModel] = useState("");
  const [query, setQuery] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<string | undefined>(chat?.settings.reasoning_effort);
  const [reasoningTokens, setReasoningTokens] = useState<number | undefined>(chat?.settings.reasoning_tokens);
  const [showThinking, setShowThinking] = useState<boolean>(chat?.settings.show_thinking_by_default ?? true);
  const [showStats, setShowStats] = useState<boolean>(chat?.settings.show_stats ?? true);

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

  function Section(props: { title: string; children: ReactNode }) {
    return (
      <div className="card p-4 space-y-3">
        <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{props.title}</div>
        {props.children}
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setUI({ showSettings: false })} />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-surface border-l border-border shadow-[var(--shadow-card)] z-50 overflow-y-auto will-change-transform">
        {/* Header */}
        <div
          className="flex items-center gap-3 border-b border-border sticky top-0 bg-surface z-10 px-4"
          style={{ height: "var(--header-height)" }}
        >
          <h3 className="font-semibold">Settings</h3>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <button className="btn btn-ghost" onClick={() => setUI({ showSettings: false })}>Close</button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* General */}
          <Section title="General">
            <div className="space-y-2">
              <label className="text-sm">System prompt</label>
              <textarea
                className="textarea w-full"
                rows={5}
                placeholder="You are a helpful assistant."
                value={system}
                onChange={(e) => setSystem(e.target.value)}
              />
            </div>
          </Section>

          {/* Generation */}
          <Section title="Generation">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm flex items-center justify-between">
                  <span>Temperature</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTemperature(undefined)}>Reset</button>
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
                  <button className="btn btn-ghost btn-sm" onClick={() => setTopP(undefined)}>Reset</button>
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
                  <button className="btn btn-ghost btn-sm" onClick={() => setMaxTokens(undefined)}>Auto</button>
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
          </Section>

          {/* Reasoning */}
          <Section title="Reasoning">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div className="space-y-1">
                <label className="text-sm flex items-center justify-between">
                  <span>Reasoning effort</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setReasoningEffort(undefined)}>Default</button>
                </label>
                <select
                  className="input w-full"
                  value={reasoningEffort ?? "low"}
                  onChange={(e) => setReasoningEffort(e.target.value as any)}
                >
                  <option value="none">none</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm flex items-center justify-between">
                  <span>Reasoning tokens</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setReasoningTokens(undefined)}>Auto</button>
                </label>
                <input
                  className="input w-full"
                  type="number"
                  step="1"
                  min="1"
                  value={reasoningTokens ?? ""}
                  placeholder="auto"
                  onChange={(e) => setReasoningTokens(e.target.value === "" ? undefined : parseInt(e.target.value))}
                />
              </div>
            </div>
          </Section>

          {/* Display */}
          <Section title="Display">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm">Show thinking by default</label>
                <div className="flex gap-2">
                  <button className={`btn btn-sm ${showThinking ? '' : 'btn-outline'}`} onClick={() => setShowThinking(true)}>On</button>
                  <button className={`btn btn-sm ${!showThinking ? '' : 'btn-outline'}`} onClick={() => setShowThinking(false)}>Off</button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm">Show stats</label>
                <div className="flex gap-2">
                  <button className={`btn btn-sm ${showStats ? '' : 'btn-outline'}`} onClick={() => setShowStats(true)}>On</button>
                  <button className={`btn btn-sm ${!showStats ? '' : 'btn-outline'}`} onClick={() => setShowStats(false)}>Off</button>
                </div>
              </div>
            </div>
          </Section>

          {/* Models */}
          <Section title="Models">
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm">Add custom model ID</label>
                <div className="flex gap-2">
                  <input className="input flex-1" placeholder="provider/model-id" value={customModel} onChange={(e) => setCustomModel(e.target.value)} />
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      const id = customModel.trim();
                      if (!id) return;
                      if (!favoriteModelIds.includes(id)) toggleFavoriteModel(id);
                      if (chat) {
                        updateChatSettings({ model: id });
                      } else {
                        setUI({ nextModel: id });
                      }
                      setCustomModel("");
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  className="input w-full"
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
                            if (chat) {
                              updateChatSettings({ model: m.id });
                            } else {
                              setUI({ nextModel: m.id });
                            }
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
          </Section>
        </div>

        {/* Sticky footer */}
        <div className="px-6 py-4 border-t border-border sticky bottom-0 bg-surface">
          <button
            className="btn"
            onClick={() => {
              if (chat) {
                updateChatSettings({ system, temperature, top_p, max_tokens, reasoning_effort: reasoningEffort as any, reasoning_tokens: reasoningTokens, show_thinking_by_default: showThinking, show_stats: showStats });
              } else {
                // No chat yet, persist defaults for the next chat
                setUI({ nextModel: undefined });
              }
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


