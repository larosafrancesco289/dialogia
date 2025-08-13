'use client';
import { useChatStore } from '@/lib/store';
import { useEffect, useMemo, useState, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ThemeToggle from '@/components/ThemeToggle';

// Define Section at module scope so it doesn't remount on every render.
function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

export default function SettingsDrawer() {
  const {
    chats,
    selectedChatId,
    updateChatSettings,
    setUI,
    loadModels,
    toggleFavoriteModel,
    favoriteModelIds,
    models,
    hiddenModelIds,
    resetHiddenModels,
  } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [system, setSystem] = useState(chat?.settings.system ?? '');
  const [temperature, setTemperature] = useState<number | undefined>(chat?.settings.temperature);
  const [top_p, setTopP] = useState<number | undefined>(chat?.settings.top_p);
  const [max_tokens, setMaxTokens] = useState<number | undefined>(chat?.settings.max_tokens);
  // Local string mirrors to avoid type=number focus/validation quirks
  const [temperatureStr, setTemperatureStr] = useState<string>(
    chat?.settings.temperature != null ? String(chat.settings.temperature) : '',
  );
  const [topPStr, setTopPStr] = useState<string>(
    chat?.settings.top_p != null ? String(chat.settings.top_p) : '',
  );
  const [maxTokensStr, setMaxTokensStr] = useState<string>(
    chat?.settings.max_tokens != null ? String(chat.settings.max_tokens) : '',
  );
  const [customModel, setCustomModel] = useState('');
  const [query, setQuery] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<string | undefined>(
    chat?.settings.reasoning_effort,
  );
  const [reasoningTokens, setReasoningTokens] = useState<number | undefined>(
    chat?.settings.reasoning_tokens,
  );
  const [reasoningTokensStr, setReasoningTokensStr] = useState<string>(
    chat?.settings.reasoning_tokens != null ? String(chat.settings.reasoning_tokens) : '',
  );
  const [showThinking, setShowThinking] = useState<boolean>(
    chat?.settings.show_thinking_by_default ?? true,
  );
  const [showStats, setShowStats] = useState<boolean>(chat?.settings.show_stats ?? true);
  const [closing, setClosing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const closeWithAnim = () => {
    setClosing(true);
    window.setTimeout(() => setUI({ showSettings: false }), 190);
  };

  // Keep local state in sync when switching chats or reopening the drawer
  useEffect(() => {
    setReasoningEffort(chat?.settings.reasoning_effort);
  }, [chat?.id, chat?.settings.reasoning_effort]);

  // Prevent background scroll while drawer is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Load models for autocomplete on mount (if key configured)
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const filtered = useMemo(() => {
    if (!normalizedQuery) return [] as { id: string; name?: string }[];
    const words = normalizedQuery.split(' ');
    return (models || [])
      .filter((m) => {
        const hay = `${m.id} ${m.name ?? ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 50)
      .map((m) => ({ id: m.id, name: m.name }));
  }, [models, normalizedQuery]);

  // Position the dropdown using fixed coordinates so it is never clipped
  useLayoutEffect(() => {
    const update = () => {
      if (!normalizedQuery) return setDropdownPos(null);
      const el = searchRef.current;
      if (!el) return setDropdownPos(null);
      const r = el.getBoundingClientRect();
      const margin = 8;
      const footer = 88; // sticky footer height
      const viewportH = window.innerHeight;
      const available = Math.max(120, viewportH - footer - margin - r.bottom);
      setDropdownPos({ left: r.left, top: r.bottom + margin, width: r.width, maxHeight: available });
    };
    update();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update as any);
      window.removeEventListener('scroll', update as any, true as any);
    };
  }, [normalizedQuery]);

  return (
    <>
      <div className={`fixed inset-0 bg-black/30 z-[70] settings-overlay${closing ? ' is-closing' : ''}`} onClick={closeWithAnim} />
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[520px] glass-panel border-l border-border shadow-[var(--shadow-card)] z-[80] overflow-y-auto will-change-transform settings-drawer${closing ? ' is-closing' : ''}`} style={{ overscrollBehavior: 'contain' }}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border sticky top-0 glass z-10 px-4" style={{ height: 'var(--header-height)' }}>
          <h3 className="font-semibold">Settings</h3>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <button className="btn btn-ghost" onClick={closeWithAnim}>
              Close
            </button>
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
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </Section>

          {/* Generation */}
          <Section title="Generation">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm flex items-center justify-between">
                  <span>Temperature</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setTemperature(undefined);
                      setTemperatureStr('');
                    }}
                  >
                    Reset
                  </button>
                </label>
                <input
                  className="input w-full"
                  inputMode="decimal"
                  placeholder="model default"
                  value={temperatureStr}
                  onChange={(e) => setTemperatureStr(e.target.value)}
                  onBlur={() => {
                    const v = temperatureStr.trim();
                    if (v === '') {
                      setTemperature(undefined);
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isNaN(n)) setTemperature(n);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm flex items-center justify-between">
                  <span>Top_p</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setTopP(undefined);
                      setTopPStr('');
                    }}
                  >
                    Reset
                  </button>
                </label>
                <input
                  className="input w-full"
                  inputMode="decimal"
                  placeholder="model default"
                  value={topPStr}
                  onChange={(e) => setTopPStr(e.target.value)}
                  onBlur={() => {
                    const v = topPStr.trim();
                    if (v === '') {
                      setTopP(undefined);
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isNaN(n)) setTopP(n);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm flex items-center justify-between">
                  <span>Max tokens</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setMaxTokens(undefined);
                      setMaxTokensStr('');
                    }}
                  >
                    Auto
                  </button>
                </label>
                <input
                  className="input w-full"
                  inputMode="numeric"
                  placeholder="auto"
                  value={maxTokensStr}
                  onChange={(e) => setMaxTokensStr(e.target.value)}
                  onBlur={() => {
                    const v = maxTokensStr.trim();
                    if (v === '') {
                      setMaxTokens(undefined);
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isNaN(n)) setMaxTokens(Math.floor(n));
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
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
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReasoningEffort(undefined)}
                  >
                    Default
                  </button>
                </label>
                <select
                  className="input w-full"
                  value={reasoningEffort ?? ''}
                  onChange={(e) => setReasoningEffort((e.target.value || undefined) as any)}
                >
                  <option value="">model default</option>
                  <option value="none">none</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm flex items-center justify-between">
                  <span>Reasoning tokens</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setReasoningTokens(undefined);
                      setReasoningTokensStr('');
                    }}
                  >
                    Auto
                  </button>
                </label>
                <input
                  className="input w-full"
                  inputMode="numeric"
                  placeholder="auto"
                  value={reasoningTokensStr}
                  onChange={(e) => setReasoningTokensStr(e.target.value)}
                  onBlur={() => {
                    const v = reasoningTokensStr.trim();
                    if (v === '') {
                      setReasoningTokens(undefined);
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isNaN(n)) setReasoningTokens(Math.floor(n));
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </Section>

          {/* Display */}
          <Section title="Display">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm block">Show thinking by default</label>
                <div className="segmented">
                  <button className={`segment ${showThinking ? 'is-active' : ''}`} onClick={() => setShowThinking(true)}>On</button>
                  <button className={`segment ${!showThinking ? 'is-active' : ''}`} onClick={() => setShowThinking(false)}>Off</button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm block">Show stats</label>
                <div className="segmented">
                  <button className={`segment ${showStats ? 'is-active' : ''}`} onClick={() => setShowStats(true)}>On</button>
                  <button className={`segment ${!showStats ? 'is-active' : ''}`} onClick={() => setShowStats(false)}>Off</button>
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
                  <input
                    className="input flex-1"
                    placeholder="provider/model-id"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
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
                      setCustomModel('');
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  ref={searchRef}
                  className="input w-full"
                  placeholder="Search OpenRouter models (e.g. openai, anthropic, llama)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
                {dropdownPos &&
                  createPortal(
                    <div
                      className="fixed card p-2 overflow-auto z-[90]"
                      style={{
                        left: dropdownPos.left,
                        top: dropdownPos.top,
                        width: dropdownPos.width,
                        maxHeight: dropdownPos.maxHeight,
                        overscrollBehavior: 'contain',
                      }}
                    >
                      {filtered.length === 0 && (
                        <div className="p-2 text-sm text-muted-foreground">No matches</div>
                      )}
                      {filtered.map((m) => (
                        <div
                          key={m.id}
                          className="p-2 rounded hover:bg-muted cursor-pointer flex items-center justify-between gap-2"
                        >
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
                              setQuery('');
                            }}
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>,
                    document.body,
                  )}
              </div>
              <div>
                <button className="btn btn-ghost" onClick={() => loadModels()}>
                  Refresh model list
                </button>
              </div>
              {hiddenModelIds && hiddenModelIds.length > 0 && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">
                    {hiddenModelIds.length} hidden {hiddenModelIds.length === 1 ? 'model' : 'models'}
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => resetHiddenModels()}>
                    Reset hidden
                  </button>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Sticky footer */}
        <div className="px-6 h-[88px] flex items-center border-t border-border sticky bottom-0 glass">
          <button
            className="btn"
            onClick={() => {
              if (chat) {
                updateChatSettings({
                  system,
                  temperature,
                  top_p,
                  max_tokens,
                  reasoning_effort: (reasoningEffort || undefined) as any,
                  reasoning_tokens: reasoningTokens,
                  show_thinking_by_default: showThinking,
                  show_stats: showStats,
                });
              } else {
                // No chat yet, persist defaults for the next chat
                setUI({ nextModel: undefined });
              }
              closeWithAnim();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}
