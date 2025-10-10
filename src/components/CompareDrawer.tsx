'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { Markdown } from '@/lib/markdown';
import ImageLightbox from '@/components/ImageLightbox';
import { CURATED_MODELS } from '@/data/curatedModels';
import { PINNED_MODEL_ID, DEFAULT_MODEL_ID } from '@/lib/constants';
import IconButton from '@/components/IconButton';
import { XCircleIcon, StopIcon } from '@heroicons/react/24/outline';
import { computeCost } from '@/lib/cost';
import { findModelById } from '@/lib/models';
import ModelSearch from '@/components/ModelSearch';
import {
  selectCompareState,
  selectCurrentChat,
  selectFavoriteModelIds,
  selectHiddenModelIds,
  selectModels,
  selectNextModel,
} from '@/lib/store/selectors';

export default function CompareDrawer() {
  // Subscribe to precise store slices to avoid stale values
  const setCompare = useChatStore((s) => s.setCompare);
  const closeCompare = useChatStore((s) => s.closeCompare);
  const runCompare = useChatStore((s) => s.runCompare);
  const stopCompare = useChatStore((s) => s.stopCompare);
  const models = useChatStore(selectModels);
  const favoriteModelIds = useChatStore(selectFavoriteModelIds);
  const hiddenModelIds = useChatStore(selectHiddenModelIds);
  const chat = useChatStore(selectCurrentChat);
  const compareState = useChatStore(selectCompareState);
  const nextModel = useChatStore(selectNextModel);
  const loadModels = useChatStore((s) => s.loadModels);
  const compare = compareState || { isOpen: false, prompt: '', selectedModelIds: [], runs: {} };
  const updateChatSettings = useChatStore((s) => s.updateChatSettings);
  const [closing, setClosing] = useState(false);
  const closeWithAnim = () => {
    setClosing(true);
    window.setTimeout(() => closeCompare(), 190);
  };
  const appendAssistantMessage = useChatStore((s) => s.appendAssistantMessage);
  const [lightbox, setLightbox] = useState<{
    images: { src: string; name?: string }[];
    index: number;
  } | null>(null);

  // Curated + favorites list for quick selection (use model metadata when available)
  const curated = useMemo(() => CURATED_MODELS, []);
  const favoriteOptions = useMemo(() => {
    const nameById = new Map((models || []).map((m) => [m.id, m.name as string | undefined]));
    const allowed = new Set((models || []).map((m) => m.id));
    return (favoriteModelIds || [])
      .filter((id): id is string => Boolean(id && typeof id === 'string' && allowed.has(id)))
      .map((id) => ({ id, name: nameById.get(id) || id }));
  }, [favoriteModelIds, models]);
  const currentModelId = chat?.settings.model || nextModel || DEFAULT_MODEL_ID;
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
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
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
                <StopIcon className="h-5 w-5" />
              </IconButton>
            ) : (
              <IconButton title="Close" onClick={closeWithAnim}>
                <XCircleIcon className="h-5 w-5" />
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
                <div className="mt-2">
                  <ModelSearch
                    placeholder="Search OpenRouter models (e.g. openai, anthropic, llama)"
                    selectedIds={compare.selectedModelIds || []}
                    actionLabel="Select"
                    selectedLabel="Selected"
                    onSelect={(result) => {
                      const set = new Set(compare.selectedModelIds || []);
                      if (set.has(result.id)) set.delete(result.id);
                      else set.add(result.id);
                      setCompare({ selectedModelIds: Array.from(set).slice(0, 6) });
                    }}
                  />
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
                      <StopIcon className="h-5 w-5" />
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
                      <div className="px-3 py-2 flex items-center gap-2 justify-end">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={async () => {
                            const text = (run?.content || '').trim();
                            if (!text) return;
                            try {
                              await navigator.clipboard.writeText(text);
                            } catch {}
                          }}
                          title="Copy result to clipboard"
                        >
                          Copy
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={async () => {
                            const text = (run?.content || '').trim();
                            if (!text || !chat) return;
                            await appendAssistantMessage(text, { modelId: id });
                            closeWithAnim();
                          }}
                          title="Insert result into chat"
                        >
                          Insert to chat
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            if (chat) updateChatSettings({ model: id });
                            else setCompare({});
                            closeWithAnim();
                          }}
                          title="Use this model in chat"
                        >
                          Use model
                        </button>
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
                      {/* Images (if any) */}
                      {Array.isArray(run?.images) && run.images.length > 0 && (
                        <div className="px-3 pt-3 grid grid-cols-2 gap-2">
                          {run.images.map((src, idx) => (
                            <button
                              key={idx}
                              className="p-0 m-0 border-none bg-transparent"
                              title="Click to enlarge"
                              onClick={() =>
                                setLightbox({
                                  images: run.images!.map((s) => ({ src: s })),
                                  index: idx,
                                })
                              }
                            >
                              <img
                                src={src}
                                alt={`image-${idx + 1}`}
                                className="w-full h-48 object-cover rounded border border-border"
                              />
                            </button>
                          ))}
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
                            const modelMeta = findModelById(models, id);
                            const cost = computeCost({
                              model: modelMeta,
                              promptTokens: m.promptTokens,
                              completionTokens: m.completionTokens,
                            });
                            if (cost.total != null)
                              parts.push(`${cost.currency || 'USD'} ${cost.total.toFixed(5)}`);
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
