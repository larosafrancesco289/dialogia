'use client';
import { useChatStore } from '@/lib/store';
import { useEffect, useMemo, useState, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ThemeToggle from '@/components/ThemeToggle';
import IconButton from '@/components/IconButton';
import {
  CloseCircleIcon,
  CheckIcon,
  EditIcon,
  TrashIcon,
  PlusIcon,
} from '@/components/icons/Icons';
import {
  getSystemPresets,
  addSystemPreset,
  updateSystemPreset,
  deleteSystemPreset,
  type SystemPreset,
} from '@/lib/presets';
import {
  isReasoningSupported,
  isVisionSupported,
  findModelById,
  isAudioInputSupported,
  isImageOutputSupported,
} from '@/lib/models';
import { describeModelPricing } from '@/lib/cost';
import { EyeIcon, LightBulbIcon, MicrophoneIcon, PhotoIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

// Define Section at module scope so it doesn't remount on every render.
function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium text-muted-foreground">{props.title}</div>
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
    ui,
    loadModels,
    toggleFavoriteModel,
    favoriteModelIds,
    models,
    hiddenModelIds,
    resetHiddenModels,
    initializeApp,
    zdrModelIds,
    zdrProviderIds,
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
  // Removed manual custom model input; use search below
  const [query, setQuery] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<
    'none' | 'low' | 'medium' | 'high' | undefined
  >(chat?.settings.reasoning_effort);
  const [reasoningTokens, setReasoningTokens] = useState<number | undefined>(
    chat?.settings.reasoning_tokens,
  );
  const [reasoningTokensStr, setReasoningTokensStr] = useState<string>(
    chat?.settings.reasoning_tokens != null ? String(chat.settings.reasoning_tokens) : '',
  );
  const [showThinking, setShowThinking] = useState<boolean>(
    chat?.settings.show_thinking_by_default ?? true,
  );
  const [showStats, setShowStats] = useState<boolean>(chat?.settings.show_stats ?? false);
  const [closing, setClosing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [routePref, setRoutePref] = useState<'speed' | 'cost'>(
    (useChatStore.getState().ui.routePreference as any) || 'speed',
  );
  const experimentalBrave = useChatStore((s) => !!s.ui.experimentalBrave);
  const experimentalDeepResearch = useChatStore((s) => !!s.ui.experimentalDeepResearch);
  const experimentalTutor = useChatStore((s) => !!s.ui.experimentalTutor);
  // System prompt presets
  const [presets, setPresets] = useState<SystemPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [dropdownPos, setDropdownPos] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const closeWithAnim = () => {
    setClosing(true);
    window.setTimeout(() => setUI({ showSettings: false }), 190);
  };

  // Keep local state in sync when switching chats or reopening the drawer
  useEffect(() => {
    // When switching chats, sync drawer fields from the selected chat
    setSystem(chat?.settings.system ?? '');
    setTemperature(chat?.settings.temperature);
    setTopP(chat?.settings.top_p);
    setMaxTokens(chat?.settings.max_tokens);
    setTemperatureStr(chat?.settings.temperature != null ? String(chat.settings.temperature) : '');
    setTopPStr(chat?.settings.top_p != null ? String(chat.settings.top_p) : '');
    setMaxTokensStr(chat?.settings.max_tokens != null ? String(chat.settings.max_tokens) : '');
    setReasoningEffort(chat?.settings.reasoning_effort);
    setReasoningTokens(chat?.settings.reasoning_tokens);
    setReasoningTokensStr(
      chat?.settings.reasoning_tokens != null ? String(chat.settings.reasoning_tokens) : '',
    );
    setShowThinking(chat?.settings.show_thinking_by_default ?? true);
    setShowStats(chat?.settings.show_stats ?? false);
  }, [chat?.id]);

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

  // Focus model search shortly after opening for quick access
  useEffect(() => {
    const tid = window.setTimeout(() => {
      try {
        searchRef.current?.focus({ preventScroll: true } as any);
      } catch {}
    }, 80);
    return () => window.clearTimeout(tid);
  }, []);

  // Load saved system prompt presets on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await getSystemPresets();
      if (!mounted) return;
      // Sort alphabetically for stable UI
      const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
      setPresets(sorted);
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  const onExport = async () => {
    try {
      const { exportAll } = await import('@/lib/db');
      const data = await exportAll();
      const text = JSON.stringify(data, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `dialogia-backup-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(
        ts.getDate(),
      )}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setUI({ notice: 'Exported chats to JSON' });
    } catch (e: any) {
      setUI({ notice: e?.message || 'Export failed' });
    }
  };

  const onImportPicked = async (file?: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const { importAll } = await import('@/lib/db');
      await importAll(json);
      await initializeApp();
      setUI({ notice: 'Imported data' });
    } catch (e: any) {
      setUI({ notice: e?.message || 'Import failed' });
    }
  };

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
      setDropdownPos({
        left: r.left,
        top: r.bottom + margin,
        width: r.width,
        maxHeight: available,
      });
    };
    update();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update as any);
      window.removeEventListener('scroll', update as any, true as any);
    };
  }, [normalizedQuery]);

  // Close the search dropdown when clicking outside
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!normalizedQuery) return;
      const target = e.target as Node | null;
      const inputEl = searchRef.current;
      const dropEl = dropdownRef.current;
      if (inputEl && target && inputEl.contains(target)) return;
      if (dropEl && target && dropEl.contains(target)) return;
      setQuery('');
      setDropdownPos(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [normalizedQuery]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-[70] settings-overlay${closing ? ' is-closing' : ''}`}
        onClick={closeWithAnim}
        aria-hidden
      />
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[640px] glass-panel border-l border-border shadow-[var(--shadow-card)] z-[80] overflow-y-auto will-change-transform settings-drawer${closing ? ' is-closing' : ''}`}
        style={{ overscrollBehavior: 'contain' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeWithAnim();
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 border-b border-border sticky top-0 glass z-10 px-4"
          style={{ height: 'var(--header-height)' }}
        >
          <h3 id="settings-title" className="font-semibold">
            Settings
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <IconButton title="Close" onClick={closeWithAnim} className="w-11 h-11 sm:w-9 sm:h-9">
              <CloseCircleIcon size={24} />
            </IconButton>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4 pb-8">
          {/* Models (moved to top) */}
          <Section title="Models">
            <div className="space-y-3">
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
                      ref={dropdownRef}
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
                      {filtered.map((m) => {
                        const meta = findModelById(models, m.id);
                        const canReason = isReasoningSupported(meta);
                        const canSee = isVisionSupported(meta);
                        const canImageOut = isImageOutputSupported(meta);
                        const priceStr = describeModelPricing(meta);
                        // Prefer a concise name: drop provider prefixes like "Anthropic: ..."
                        const displayName = String(m.name || m.id).replace(/^[^:]+:\\s*/, '');
                        const provider = String(m.id).split('/')[0];
                        const isZdr = Boolean(
                          (zdrModelIds && zdrModelIds.includes(m.id)) ||
                            (zdrProviderIds && zdrProviderIds.includes(provider)),
                        );
                        return (
                          <div
                            key={m.id}
                            className="p-2 rounded hover:bg-muted cursor-pointer flex items-center justify-between gap-2"
                          >
                            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 w-full">
                              <div className="font-medium text-sm flex items-center gap-2 min-w-0">
                                <span className="truncate" title={m.id}>{displayName}</span>
                                <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                                  {canReason && (
                                    <LightBulbIcon
                                      className="h-4 w-4"
                                      aria-label="Reasoning supported"
                                      title="Reasoning supported"
                                    />
                                  )}
                                  {canSee && (
                                    <EyeIcon
                                      className="h-4 w-4"
                                      aria-label="Vision input"
                                      title="Vision input"
                                    />
                                  )}
                                  {canImageOut && (
                                    <PhotoIcon
                                      className="h-4 w-4"
                                      aria-label="Image generation"
                                      title="Image generation"
                                    />
                                  )}
                                  {isAudioInputSupported(meta) && (
                                    <MicrophoneIcon
                                      className="h-4 w-4"
                                      aria-label="Audio input"
                                      title="Audio input"
                                    />
                                  )}
                                  {isZdr && (
                                    <ShieldCheckIcon
                                      className="h-4 w-4"
                                      aria-label="Zero Data Retention"
                                      title="Zero Data Retention"
                                    />
                                  )}
                                </span>
                              </div>
                              {priceStr && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {priceStr}
                                </span>
                              )}
                              <div className="justify-self-end">
                                <IconButton
                                  title="Add model"
                                  size="sm"
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
                                  <PlusIcon size={16} />
                                </IconButton>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
                    {hiddenModelIds.length} hidden{' '}
                    {hiddenModelIds.length === 1 ? 'model' : 'models'}
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => resetHiddenModels()}>
                    Reset hidden
                  </button>
                </div>
              )}
            </div>
          </Section>

          {/* Web Search (new dedicated section) */}
          <Section title="Web Search">
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-sm block">Provider</label>
                <div className="segmented">
                  {experimentalBrave && (
                    <button
                      className={`segment ${(((chat?.settings as any)?.search_provider as any) ?? (ui as any)?.nextSearchProvider ?? 'brave') === 'brave' ? 'is-active' : ''}`}
                      onClick={() => {
                        if (chat) updateChatSettings({ search_provider: 'brave' } as any);
                        else setUI({ nextSearchProvider: 'brave' } as any);
                      }}
                    >
                      Brave
                    </button>
                  )}
                  <button
                    className={`segment ${(((chat?.settings as any)?.search_provider as any) ?? (ui as any)?.nextSearchProvider ?? (experimentalBrave ? 'brave' : 'openrouter')) === 'openrouter' ? 'is-active' : ''}`}
                    onClick={() => {
                      if (chat) updateChatSettings({ search_provider: 'openrouter' } as any);
                      else setUI({ nextSearchProvider: 'openrouter' } as any);
                    }}
                  >
                    OpenRouter
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {experimentalBrave
                    ? 'Brave uses local function-calling; OpenRouter injects the web plugin to include citations.'
                    : 'OpenRouter injects the web plugin to include citations.'}
                </div>
              </div>
            </div>
          </Section>

          {/* General */}
          <Section title="General">
            <div className="space-y-2">
              <label className="text-sm">System prompt</label>
              {/* Presets controls */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input"
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <option value="">Select a preset…</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <IconButton
                    title="Apply preset"
                    onClick={async () => {
                      const p = presets.find((x) => x.id === selectedPresetId);
                      if (!p) return;
                      setSystem(p.system);
                      if (chat) await updateChatSettings({ system: p.system });
                    }}
                    disabled={!selectedPresetId}
                  >
                    <CheckIcon />
                  </IconButton>
                  <IconButton
                    title="Save as preset"
                    onClick={async () => {
                      const name = window.prompt('Preset name?');
                      if (name == null) return;
                      const p = await addSystemPreset(name, system);
                      setSelectedPresetId(p.id);
                      const list = await getSystemPresets();
                      const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
                      setPresets(sorted);
                    }}
                  >
                    <PlusIcon />
                  </IconButton>
                  <IconButton
                    title="Rename preset"
                    onClick={async () => {
                      const p = presets.find((x) => x.id === selectedPresetId);
                      if (!p) return;
                      const next = window.prompt('Rename preset', p.name);
                      if (next == null) return;
                      await updateSystemPreset(p.id, { name: next.trim() || p.name });
                      const list = await getSystemPresets();
                      const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
                      setPresets(sorted);
                    }}
                    disabled={!selectedPresetId}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    title="Delete preset"
                    onClick={async () => {
                      const p = presets.find((x) => x.id === selectedPresetId);
                      if (!p) return;
                      const ok = window.confirm(`Delete preset "${p.name}"?`);
                      if (!ok) return;
                      await deleteSystemPreset(p.id);
                      const list = await getSystemPresets();
                      const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
                      setPresets(sorted);
                      setSelectedPresetId('');
                    }}
                    disabled={!selectedPresetId}
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Choose, apply, save, or manage reusable system prompts.
              </div>
              <div className="soft-divider" />
              <textarea
                className="textarea w-full"
                rows={5}
                placeholder="You are a helpful assistant."
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="text-xs text-muted-foreground">
                This is sent at the start of the chat to steer behavior.
              </div>
            </div>
          </Section>

          {/* Privacy */}
          <Section title="Privacy">
            <div className="space-y-2">
              <label className="text-sm flex items-center justify-between">
                <span>Zero Data Retention (ZDR) only</span>
                <div className="segmented">
                  <button
                    className={`segment ${ui?.zdrOnly !== false ? 'is-active' : ''}`}
                    onClick={() => {
                      setUI({ zdrOnly: true });
                      loadModels();
                    }}
                  >
                    On
                  </button>
                  <button
                    className={`segment ${ui?.zdrOnly === false ? 'is-active' : ''}`}
                    onClick={() => {
                      setUI({ zdrOnly: false });
                      loadModels();
                    }}
                  >
                    Off
                  </button>
                </div>
              </label>
              <div className="text-xs text-muted-foreground">
                When enabled, model search results are limited to providers with a Zero Data
                Retention policy (fetched from OpenRouter). Curated defaults also follow this.
              </div>
            </div>
          </Section>

          {/* Routing */}
          <Section title="Routing">
            <div className="space-y-2">
              <label className="text-sm block">Route preference</label>
              <div className="segmented">
                <button
                  className={`segment ${routePref === 'speed' ? 'is-active' : ''}`}
                  onClick={() => {
                    setRoutePref('speed');
                    setUI({ routePreference: 'speed' });
                  }}
                >
                  Speed
                </button>
                <button
                  className={`segment ${routePref === 'cost' ? 'is-active' : ''}`}
                  onClick={() => {
                    setRoutePref('cost');
                    setUI({ routePreference: 'cost' });
                  }}
                >
                  Cost
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                Speed sorts by provider throughput; Cost sorts by price. OpenRouter routing uses
                this hint when selecting a provider for the chosen model.
              </div>
            </div>
          </Section>

          {/* Generation */}
          <Section title="Generation">
            <div className="space-y-3">
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
                <div className="text-xs text-muted-foreground">
                  Higher = more creative. Leave blank for model default.
                </div>
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
                <div className="text-xs text-muted-foreground">
                  Nucleus sampling. 1.0 ≈ off. Leave blank for default.
                </div>
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
                <div className="text-xs text-muted-foreground">
                  Upper bound on output length. Leave blank to auto-select.
                </div>
              </div>
            </div>
          </Section>

          {/* Reasoning */}
          <Section title="Reasoning">
            <div className="space-y-3">
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
                <div className="text-xs text-muted-foreground">
                  Request model reasoning depth (if supported).
                </div>
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
                <div className="text-xs text-muted-foreground">
                  Budget for chain‑of‑thought tokens (supported models only).
                </div>
              </div>
            </div>
          </Section>

          {/* Display */}
          <Section title="Display">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm block">Show thinking by default</label>
                <div className="segmented">
                  <button
                    className={`segment ${showThinking ? 'is-active' : ''}`}
                    onClick={() => setShowThinking(true)}
                  >
                    On
                  </button>
                  <button
                    className={`segment ${!showThinking ? 'is-active' : ''}`}
                    onClick={() => setShowThinking(false)}
                  >
                    Off
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Expand the reasoning panel automatically for new messages.
                </div>
              </div>
              <div className="soft-divider" />
              <div className="space-y-1">
                <label className="text-sm block">Show stats</label>
                <div className="segmented">
                  <button
                    className={`segment ${showStats ? 'is-active' : ''}`}
                    onClick={() => setShowStats(true)}
                  >
                    On
                  </button>
                  <button
                    className={`segment ${!showStats ? 'is-active' : ''}`}
                    onClick={() => setShowStats(false)}
                  >
                    Off
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Display model, timing, and cost info under messages.
                </div>
              </div>
            </div>
          </Section>

          {/* Debug */}
          <Section title="Debug">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm block">Enable debug view</label>
                <div className="segmented">
                  <button
                    className={`segment ${ui?.debugMode ? 'is-active' : ''}`}
                    onClick={() => setUI({ debugMode: true })}
                  >
                    On
                  </button>
                  <button
                    className={`segment ${!ui?.debugMode ? 'is-active' : ''}`}
                    onClick={() => setUI({ debugMode: false })}
                  >
                    Off
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Show a Debug panel under assistant messages with the exact request payload sent to
                  OpenRouter.
                </div>
              </div>
            </div>
          </Section>

          {/* Experimental */}
          <Section title="Experimental">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm block">Brave Web Search</label>
                <div className="segmented">
                  <button
                    className={`segment ${experimentalBrave ? 'is-active' : ''}`}
                    onClick={() => setUI({ experimentalBrave: true })}
                  >
                    On
                  </button>
                  <button
                    className={`segment ${!experimentalBrave ? 'is-active' : ''}`}
                    onClick={() => setUI({ experimentalBrave: false })}
                  >
                    Off
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Toggle Brave integration for web search and sources panel.
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm block">Tutor Mode</label>
                <div className="segmented">
                  <button
                    className={`segment ${experimentalTutor ? 'is-active' : ''}`}
                    onClick={() => setUI({ experimentalTutor: true })}
                  >
                    On
                  </button>
                  <button
                    className={`segment ${!experimentalTutor ? 'is-active' : ''}`}
                    onClick={() => setUI({ experimentalTutor: false })}
                  >
                    Off
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Show Tutor controls and enable practice tools (MCQ, fill‑blank, flashcards).
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm block">DeepResearch</label>
                <div className="segmented">
                  <button
                    className={`segment ${experimentalDeepResearch ? 'is-active' : ''}`}
                    onClick={() => setUI({ experimentalDeepResearch: true })}
                  >
                    On
                  </button>
                  <button
                    className={`segment ${!experimentalDeepResearch ? 'is-active' : ''}`}
                    onClick={() => setUI({ experimentalDeepResearch: false })}
                  >
                    Off
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Show the DeepResearch toggle in the composer and enable multi-step research.
                </div>
              </div>
            </div>
          </Section>

          {/* Data */}
          <Section title="Data">
            <div className="space-y-2">
              <div className="flex gap-2 items-center flex-wrap">
                <button className="btn btn-outline" onClick={onExport}>
                  Export as JSON
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => importInputRef.current?.click()}
                >
                  Import from JSON
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => onImportPicked(e.currentTarget.files?.[0])}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Export creates a backup of chats, messages, and folders. Import merges data.
              </div>
            </div>
          </Section>

          {/* (Models section moved to top) */}
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
                  // keep chosen provider if present in UI for next-only case ignored here
                });
              } else {
                // Persist defaults for the next chat when no chat exists
                setUI({
                  nextSystem: system,
                  nextTemperature: temperature,
                  nextTopP: top_p,
                  nextMaxTokens: max_tokens,
                  nextReasoningEffort: (reasoningEffort || undefined) as any,
                  nextReasoningTokens: reasoningTokens,
                  nextShowThinking: showThinking,
                  nextShowStats: showStats,
                  // ensure provider selection from welcome page is retained; default based on experimental flag
                  nextSearchProvider:
                    (ui as any)?.nextSearchProvider ??
                    (chat as any)?.settings?.search_provider ??
                    (experimentalBrave ? 'brave' : 'openrouter'),
                });
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
