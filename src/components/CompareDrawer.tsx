'use client';
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useChatStore } from '@/lib/store';
import { Markdown } from '@/lib/markdown';
import { createPortal } from 'react-dom';
import { CURATED_MODELS } from '@/data/curatedModels';
import { PINNED_MODEL_ID } from '@/lib/constants';
import IconButton from '@/components/IconButton';
import { CloseCircleIcon, StopSquareIcon } from '@/components/icons/Icons';

export default function CompareDrawer() {
  // Subscribe to precise store slices to avoid stale values
  const ui = useChatStore((s) => s.ui);
  const setCompare = useChatStore((s) => s.setCompare);
  const closeCompare = useChatStore((s) => s.closeCompare);
  const runCompare = useChatStore((s) => s.runCompare);
  const stopCompare = useChatStore((s) => s.stopCompare);
  const models = useChatStore((s) => s.models);
  const favoriteModelIds = useChatStore((s) => s.favoriteModelIds);
  const hiddenModelIds = useChatStore((s) => s.hiddenModelIds);
  const chats = useChatStore((s) => s.chats);
  const selectedChatId = useChatStore((s) => s.selectedChatId);
  const loadModels = useChatStore((s) => s.loadModels);
  const compare = ui.compare || { isOpen: false, prompt: '', selectedModelIds: [], runs: {} };
  const [closing, setClosing] = useState(false);
  const closeWithAnim = () => {
    setClosing(true);
    window.setTimeout(() => closeCompare(), 190);
  };
  const chat = chats.find((c) => c.id === selectedChatId);

  // Curated + favorites list for quick selection (use model metadata when available)
  const curated = useMemo(() => CURATED_MODELS, []);
  const favoriteOptions = useMemo(() => {
    const nameById = new Map((models || []).map((m) => [m.id, m.name as string | undefined]));
    return (favoriteModelIds || [])
      .filter((id): id is string => Boolean(id && typeof id === 'string'))
      .map((id) => ({ id, name: nameById.get(id) || id }));
  }, [favoriteModelIds, models]);
  const currentModelId = chat?.settings.model || ui.nextModel || 'openai/gpt-5-chat';
  const selectedOptions = useMemo(() => {
    const map = new Map<string, { id: string; name?: string }>();
    const fromModels = new Map((models || []).map((m) => [m.id, m.name as string | undefined]));
    for (const id of compare.selectedModelIds || []) {
      if (!id) continue;
      map.set(id, { id, name: fromModels.get(id) });
    }
    return Array.from(map.values());
  }, [compare.selectedModelIds, models]);
  const allOptions = useMemo(() => {
    // Show current model + favorites + currently selected (even if not favorite)
    const list: { id: string; name?: string }[] = [];
    const PINNED_MODEL_ID_LOCAL = PINNED_MODEL_ID;
    const hidden = new Set(hiddenModelIds || []);
    if (currentModelId)
      list.push({
        id: currentModelId,
        name: models.find((m) => m.id === currentModelId)?.name || currentModelId,
      });
    // Add curated defaults for quick access, respecting hidden
    list.push(...curated.filter((o) => o.id === PINNED_MODEL_ID_LOCAL || !hidden.has(o.id)));
    // Add user favorites, respecting hidden
    list.push(
      ...(favoriteOptions || []).filter((o) => o.id === PINNED_MODEL_ID_LOCAL || !hidden.has(o.id)),
    );
    list.push(...selectedOptions);
    return list.reduce((acc: any[], m: any) => {
      if (m.id && !acc.find((x) => x.id === m.id)) acc.push(m);
      return acc;
    }, []);
  }, [
    favoriteOptions,
    curated,
    hiddenModelIds,
    currentModelId,
    selectedOptions,
    models,
    compare.isOpen,
  ]);

  // Search OpenRouter models
  const [query, setQuery] = useState('');
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

  // Position dropdown like settings search
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      if (!normalizedQuery) return setDropdownPos(null);
      const el = searchRef.current;
      if (!el) return setDropdownPos(null);
      const r = el.getBoundingClientRect();
      const margin = 8;
      const footer = 88;
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
    window.addEventListener('resize', update, { passive: true } as any);
    window.addEventListener('scroll', update, true as any);
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

  const [customId, setCustomId] = useState('');
  const addCustom = () => {
    const id = customId.trim();
    if (!id) return;
    const next = Array.from(new Set([...(compare.selectedModelIds || []), id]));
    setCompare({ selectedModelIds: next });
    setCustomId('');
  };

  const isRunning = useMemo(() => {
    return Object.values(compare.runs || {}).some((r) => r.status === 'running');
  }, [compare.runs]);

  // Focus prompt on open
  const promptRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (compare.isOpen) promptRef.current?.focus({ preventScroll: true } as any);
  }, [compare.isOpen]);

  const onRun = () => {
    const p = (compare.prompt || '').trim();
    const ids = (compare.selectedModelIds || []).filter(Boolean);
    if (!p || ids.length < 1) return;
    runCompare(p, ids).catch(() => void 0);
  };

  // Ensure compare opens with current model selected as a chip too
  useEffect(() => {
    if (compare.isOpen && currentModelId && !(compare.selectedModelIds || []).length) {
      setCompare({ selectedModelIds: [currentModelId] });
    }
  }, [compare.isOpen]);

  // Load models for search when open
  useEffect(() => {
    if (compare.isOpen) loadModels();
  }, [compare.isOpen, loadModels]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-[70] settings-overlay${closing ? ' is-closing' : ''}`}
        onClick={isRunning ? undefined : closeWithAnim}
      />
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[900px] glass-panel border-l border-border shadow-[var(--shadow-card)] z-[80] overflow-y-auto will-change-transform settings-drawer${closing ? ' is-closing' : ''}`}
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 border-b border-border sticky top-0 glass z-10 px-4"
          style={{ height: 'var(--header-height)' }}
        >
          <h3 className="font-semibold">Compare Models</h3>
          <div className="ml-auto flex items-center gap-2">
            {isRunning ? (
              <IconButton title="Stop" onClick={() => stopCompare()}>
                <StopSquareIcon size={18} />
              </IconButton>
            ) : (
              <IconButton title="Close" onClick={closeWithAnim}>
                <CloseCircleIcon size={18} />
              </IconButton>
            )}
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Selection and prompt */}
          <div className="card p-4 space-y-3">
            <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
              Setup
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              <div className="space-y-2">
                <label className="text-sm">Choose models</label>
                <div className="flex flex-wrap gap-2">
                  {allOptions.map((o) => {
                    const checked = (compare.selectedModelIds || []).includes(o.id);
                    return (
                      <button
                        key={o.id}
                        className={`btn btn-sm ${checked ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => {
                          const set = new Set(compare.selectedModelIds || []);
                          if (set.has(o.id)) set.delete(o.id);
                          else set.add(o.id);
                          setCompare({ selectedModelIds: Array.from(set).slice(0, 6) });
                        }}
                      >
                        {o.name || o.id}
                      </button>
                    );
                  })}
                </div>
                <div className="relative mt-2">
                  <input
                    ref={searchRef}
                    className="input w-full"
                    placeholder="Search OpenRouter models (e.g. openai, anthropic, llama)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
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
                          const picked = (compare.selectedModelIds || []).includes(m.id);
                          return (
                            <div
                              key={m.id}
                              className="p-2 rounded hover:bg-muted cursor-pointer flex items-center justify-between gap-2"
                              onClick={() => {
                                const set = new Set(compare.selectedModelIds || []);
                                if (set.has(m.id)) set.delete(m.id);
                                else set.add(m.id);
                                setCompare({ selectedModelIds: Array.from(set).slice(0, 6) });
                              }}
                            >
                              <div>
                                <div className="font-medium text-sm">{m.name || m.id}</div>
                                {m.name && (
                                  <div className="text-xs text-muted-foreground">{m.id}</div>
                                )}
                              </div>
                              <div className={`badge ${picked ? '' : 'opacity-50'}`}>
                                {picked ? 'Selected' : 'Select'}
                              </div>
                            </div>
                          );
                        })}
                      </div>,
                      document.body,
                    )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm">Prompt</label>
                <textarea
                  ref={promptRef}
                  className="textarea w-full"
                  rows={5}
                  placeholder="Enter the query to compare"
                  value={compare.prompt}
                  onChange={(e) => setCompare({ prompt: e.target.value })}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onRun();
                  }}
                />
                <div className="text-xs text-muted-foreground">
                  Uses current chat’s system prompt and context.
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    className="btn"
                    onClick={onRun}
                    disabled={
                      isRunning ||
                      (compare.selectedModelIds || []).length < 1 ||
                      !compare.prompt.trim()
                    }
                  >
                    {isRunning ? 'Running…' : 'Run Compare'}
                  </button>
                  {isRunning && (
                    <IconButton title="Stop" onClick={() => stopCompare()}>
                      <StopSquareIcon size={18} />
                    </IconButton>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results grid */}
          {Object.keys(compare.runs || {}).length > 0 && (
            <div className="card p-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                Results
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(compare.selectedModelIds || []).map((id) => {
                  const run = compare.runs[id];
                  const modelInfo = models.find((m) => m.id === id);
                  const title = modelInfo?.name || id;
                  return (
                    <div key={id} className="card p-0 overflow-hidden">
                      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2 bg-muted/30">
                        <div className="text-sm font-medium truncate" title={id}>
                          {title}
                        </div>
                        <div className="text-xs text-muted-foreground">{run?.status || 'idle'}</div>
                      </div>
                      {run?.reasoning && run.reasoning.length > 0 && (
                        <div className="px-3 pt-3">
                          <div className="thinking-panel">
                            <div className="text-xs text-muted-foreground mb-1">Thinking</div>
                            <pre className="whitespace-pre-wrap text-sm opacity-90 leading-relaxed">
                              {run.reasoning}
                            </pre>
                          </div>
                        </div>
                      )}
                      <div className="p-3">
                        <Markdown content={run?.content || ''} />
                      </div>
                      {run?.metrics && (
                        <div className="px-3 pb-3 -mt-2 text-xs text-muted-foreground">
                          {(() => {
                            const m = run.metrics!;
                            const parts: string[] = [];
                            if (m.ttftMs != null) parts.push(`TTFT ${m.ttftMs} ms`);
                            if (m.promptTokens != null) parts.push(`in ${m.promptTokens}`);
                            if (m.completionTokens != null) parts.push(`out ${m.completionTokens}`);
                            if (m.tokensPerSec != null) parts.push(`${m.tokensPerSec} tok/s`);
                            return parts.join(' · ');
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
