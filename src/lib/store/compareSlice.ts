import type { StoreState } from '@/lib/store/types';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { streamChatCompletion } from '@/lib/openrouter';
import { providerSortFromRoutePref } from '@/lib/agent/request';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { ZDR_NO_MATCH_NOTICE, ZDR_UNAVAILABLE_NOTICE } from '@/lib/zdr';
import { ensureListsAndFilterCached } from '@/lib/zdr/cache';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import { requireClientKeyOrProxy } from '@/lib/config';
import type { StoreSetter } from '@/lib/agent/types';
import {
  NOTICE_INVALID_KEY,
  NOTICE_MISSING_CLIENT_KEY,
  NOTICE_RATE_LIMITED,
} from '@/lib/store/notices';
import {
  setCompareController,
  abortAllCompare,
  clearCompareController,
} from '@/lib/services/controllers';
import { computeMetrics } from '@/lib/services/metrics';

export function createCompareSlice(
  set: StoreSetter,
  get: () => StoreState,
  _store?: unknown,
) {
  return {
    openCompare() {
      set((s) => {
        const chatId = get().selectedChatId;
        const chat = chatId ? get().chats.find((c) => c.id === chatId) : undefined;
        const fallback = s.ui.nextModel || DEFAULT_MODEL_ID;
        const currentModel = chat?.settings.model || fallback;
        const existing = s.ui.compare?.selectedModelIds || [];
        const initial = existing.length > 0 ? existing : [currentModel].filter(Boolean);
        return {
          ui: {
            ...s.ui,
            compare: {
              isOpen: true,
              prompt: s.ui.compare?.prompt || '',
              selectedModelIds: initial,
              runs: {},
            },
          },
        } as any;
      });
      get()
        .loadModels()
        .catch(() => void 0);
    },
    closeCompare() {
      set(
        (s) =>
          ({
            ui: {
              ...s.ui,
              compare: {
                ...(s.ui.compare || ({} as any)),
                isOpen: false,
                runs: s.ui.compare?.runs || {},
              },
            },
          }) as any,
      );
    },
    setCompare(partial) {
      set((s) => {
        const prev = s.ui.compare || { isOpen: false, prompt: '', selectedModelIds: [], runs: {} };
        const willChangeSelection = Object.prototype.hasOwnProperty.call(
          partial,
          'selectedModelIds',
        );
        return {
          ui: {
            ...s.ui,
            compare: { ...prev, ...partial, runs: willChangeSelection ? {} : prev.runs },
          },
        } as any;
      });
    },
    async runCompare(prompt: string, modelIds: string[]) {
      let key: string | undefined;
      try {
        const status = requireClientKeyOrProxy();
        key = status.key;
      } catch {
        return set((s) => ({
          ui: { ...s.ui, notice: NOTICE_MISSING_CLIENT_KEY },
        }));
      }
      // ZDR enforcement for compare: apply cached lists and filter selections
      if (get().ui.zdrOnly === true) {
        const sourceModels = modelIds.map((id) => ({ id }));
        const { lists, filter } = await ensureListsAndFilterCached(
          sourceModels,
          'enforce',
          set,
          get,
        );
        if (lists.modelIds.size === 0 && lists.providerIds.size === 0) {
          return set((s) => {
            const prev = s.ui.compare || {
              isOpen: false,
              prompt: '',
              selectedModelIds: [],
              runs: {},
            };
            return {
              ui: {
                ...s.ui,
                notice: ZDR_UNAVAILABLE_NOTICE,
                compare: { ...prev, selectedModelIds: [] },
              },
            } as any;
          });
        }
        const allowedIds = filter.models
          .map((m) => m.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        if (allowedIds.length === 0) {
          return set((s) => {
            const prev = s.ui.compare || {
              isOpen: false,
              prompt: '',
              selectedModelIds: [],
              runs: {},
            };
            return {
              ui: {
                ...s.ui,
                notice: ZDR_NO_MATCH_NOTICE,
                compare: { ...prev, selectedModelIds: [] },
              },
            } as any;
          });
        }
        modelIds = allowedIds;
      }
      const chatId = get().selectedChatId;
      const chat = chatId ? get().chats.find((c) => c.id === chatId)! : undefined;
      const prior = chatId ? (get().messages[chatId] ?? []) : [];

      set(
        (s) =>
          ({
            ui: {
              ...s.ui,
              compare: {
                ...(s.ui.compare || { isOpen: true, prompt, selectedModelIds: modelIds, runs: {} }),
                isOpen: true,
                prompt,
                selectedModelIds: modelIds,
                runs: Object.fromEntries(
                  modelIds.map((id) => [
                    id,
                    { status: 'running', content: '' as string, images: [] as string[] },
                  ]),
                ),
              },
            },
          }) as any,
      );

      abortAllCompare();

      await Promise.all(
        modelIds.map(async (modelId) => {
          const controller = new AbortController();
          setCompareController(modelId, controller);
          const tStart = performance.now();
          let tFirst: number | undefined;
          try {
            const msgs = buildChatCompletionMessages({
              chat: chat
                ? { ...chat, settings: { ...chat.settings, model: modelId } }
                : {
                    id: 'tmp',
                    title: 'Compare',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    settings: {
                      model: modelId,
                      system: 'You are a helpful assistant.',
                      show_thinking_by_default: false,
                      show_stats: true,
                      search_enabled: false,
                      reasoning_effort: undefined,
                    },
                  },
              priorMessages: prior,
              models: get().models,
              newUserContent: prompt,
            });
            {
              const caps = get().modelIndex.caps(modelId);
              const supportsReasoning = caps.canReason;
              const canImageOut = caps.canImageOut;
              const providerSort = providerSortFromRoutePref(get().ui.routePreference as any);
              const requestedEffort = supportsReasoning
                ? chat?.settings.reasoning_effort
                : undefined;
              const requestedTokensRaw = supportsReasoning
                ? chat?.settings.reasoning_tokens
                : undefined;
              const effortRequested =
                typeof requestedEffort === 'string' && requestedEffort !== 'none';
              const tokensRequested =
                typeof requestedTokensRaw === 'number' && requestedTokensRaw > 0;
              const autoReasoningEligible = !effortRequested && !tokensRequested;
              await streamChatCompletion({
                apiKey: key || '',
                model: modelId,
                messages: msgs,
                modalities: canImageOut ? (['image', 'text'] as any) : undefined,
                temperature: chat?.settings.temperature,
                top_p: chat?.settings.top_p,
                max_tokens: chat?.settings.max_tokens,
                reasoning_effort: supportsReasoning ? chat?.settings.reasoning_effort : undefined,
                reasoning_tokens: supportsReasoning ? chat?.settings.reasoning_tokens : undefined,
                signal: controller.signal,
                providerSort,
                callbacks: {
                  onImage: (dataUrl) => {
                    set(
                      (s) =>
                        ({
                          ui: {
                            ...s.ui,
                            compare: {
                              ...(s.ui.compare || {
                                isOpen: true,
                                prompt,
                                selectedModelIds: modelIds,
                                runs: {},
                              }),
                              runs: {
                                ...(s.ui.compare?.runs || {}),
                                [modelId]: {
                                  ...((s.ui.compare?.runs || {})[modelId] || {
                                    status: 'running',
                                    content: '',
                                    images: [],
                                  }),
                                  images: Array.from(
                                    new Set([
                                      ...(((s.ui.compare?.runs || {})[modelId]?.images ||
                                        []) as string[]),
                                      dataUrl,
                                    ]),
                                  ),
                                },
                              },
                            },
                          },
                        }) as any,
                    );
                  },
                  onToken: (delta) => {
                    if (tFirst == null) tFirst = performance.now();
                    set(
                      (s) =>
                        ({
                          ui: {
                            ...s.ui,
                            compare: {
                              ...(s.ui.compare || {
                                isOpen: true,
                                prompt,
                                selectedModelIds: modelIds,
                                runs: {},
                              }),
                              isOpen: true,
                              prompt: s.ui.compare?.prompt ?? prompt,
                              selectedModelIds: modelIds,
                              runs: {
                                ...(s.ui.compare?.runs || {}),
                                [modelId]: {
                                  ...((s.ui.compare?.runs || {})[modelId] || {
                                    status: 'running',
                                    content: '',
                                  }),
                                  status: 'running',
                                  content: `${(s.ui.compare?.runs || {})[modelId]?.content || ''}${delta}`,
                                },
                              },
                            },
                          },
                        }) as any,
                    );
                  },
                  onReasoningToken: (delta) => {
                    set((s) => {
                      const compareState =
                        s.ui.compare ||
                        ({
                          isOpen: true,
                          prompt,
                          selectedModelIds: modelIds,
                          runs: {},
                        } as NonNullable<typeof s.ui.compare>);
                      const prevRuns = compareState.runs || {};
                      const prevModelRun = prevRuns[modelId] || {
                        status: 'running',
                        content: '',
                      };
                      const updatedRun = {
                        ...prevModelRun,
                        reasoning: `${prevModelRun.reasoning || ''}${delta}`,
                      } as any;
                      const autoPatch = (() => {
                        if (!autoReasoningEligible) return undefined;
                        const prev = s.ui.autoReasoningModelIds || {};
                        if (prev[modelId]) return undefined;
                        return { autoReasoningModelIds: { ...prev, [modelId]: true } } as const;
                      })();
                      return {
                        ui: {
                          ...s.ui,
                          ...(autoPatch || {}),
                          compare: {
                            ...compareState,
                            isOpen: true,
                            prompt: compareState.prompt ?? prompt,
                            selectedModelIds: modelIds,
                            runs: {
                              ...prevRuns,
                              [modelId]: updatedRun,
                            },
                          },
                        },
                      } as any;
                    });
                  },
                  onDone: (full, extras) => {
                    const tEnd = performance.now();
                    const metrics = computeMetrics({
                      startedAt: tStart,
                      firstTokenAt: tFirst,
                      finishedAt: tEnd,
                      usage: extras?.usage,
                    });
                    set(
                      (s) =>
                        ({
                          ui: {
                            ...s.ui,
                            compare: {
                              ...(s.ui.compare || {
                                isOpen: true,
                                prompt,
                                selectedModelIds: modelIds,
                                runs: {},
                              }),
                              runs: {
                                ...(s.ui.compare?.runs || {}),
                                [modelId]: {
                                  ...((s.ui.compare?.runs || {})[modelId] || {
                                    status: 'running',
                                    content: '',
                                  }),
                                  status: 'done',
                                  content: full,
                                  metrics,
                                  tokensIn: metrics.promptTokens,
                                  tokensOut: metrics.completionTokens,
                                },
                              },
                            },
                          },
                        }) as any,
                    );
                  },
                  onError: (err) => {
                    set(
                      (s) =>
                        ({
                          ui: {
                            ...s.ui,
                            compare: {
                              ...(s.ui.compare || {
                                isOpen: true,
                                prompt,
                                selectedModelIds: modelIds,
                                runs: {},
                              }),
                              runs: {
                                ...(s.ui.compare?.runs || {}),
                                [modelId]: {
                                  ...((s.ui.compare?.runs || {})[modelId] || {
                                    status: 'running',
                                    content: '',
                                  }),
                                  status: 'error',
                                  error: err?.message || 'Error',
                                },
                              },
                            },
                          },
                        }) as any,
                    );
                  },
                },
              });
            }
          } catch (e: any) {
            if (e?.name === 'AbortError') {
              set(
                (s) =>
                  ({
                    ui: {
                      ...s.ui,
                      compare: {
                        ...(s.ui.compare || {
                          isOpen: true,
                          prompt,
                          selectedModelIds: modelIds,
                          runs: {},
                        }),
                        runs: {
                          ...(s.ui.compare?.runs || {}),
                          [modelId]: {
                            ...((s.ui.compare?.runs || {})[modelId] || {
                              status: 'running',
                              content: '',
                            }),
                            status: 'aborted',
                          },
                        },
                      },
                    },
                  }) as any,
              );
            } else if (isApiError(e) && e.code === API_ERROR_CODES.UNAUTHORIZED) {
              set((s) => ({ ui: { ...s.ui, notice: NOTICE_INVALID_KEY } }));
            } else if (isApiError(e) && e.code === API_ERROR_CODES.RATE_LIMITED) {
              set((s) => ({ ui: { ...s.ui, notice: NOTICE_RATE_LIMITED } }));
            } else {
              set((s) => ({ ui: { ...s.ui, notice: e?.message || 'Compare failed' } }));
            }
          } finally {
            clearCompareController(modelId);
          }
        }),
      );
    },
    stopCompare() {
      abortAllCompare();
    },
  } satisfies Partial<StoreState>;
}
