import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel, resolveDefaultModelId } from '@/lib/models';
import type { Chat } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import { useCuratedModels, useDefaultModelId } from '@/lib/hooks/useModelCatalog';
import { isModelEndpointAvailable } from '@/lib/policy/providerAvailability';
import { selectNextOverrides } from '@/lib/store/selectors';
import { parseEndpointModelId } from '@/lib/transport/endpoints';
import { getEndpoint } from '@/lib/transport/endpointRegistry';

export type ModelPickerOption = {
  id: string;
  name?: string;
};

export type ModelPickerController = {
  chat?: Chat;
  options: ModelPickerOption[];
  allOptions: ModelPickerOption[];
  current?: ModelPickerOption;
  selectedId?: string;
  selectedIds: string[];
  setModels: (modelIds: string[]) => void;
  toggleFavoriteModel: (id: string) => void;
  favoriteModelIds: string[];
  modelMap: Map<string, ReturnType<typeof findModelById>>;
  ui: StoreState['ui'];
  zdrModelIds?: string[];
  zdrProviderIds?: string[];
  setUI: StoreState['setUI'];
  zdrHiddenCount: number;
  zdrRestricted: boolean;
  /** The chat's model is one zero data retention keeps off the list. */
  currentUnavailable: boolean;
};

/** A model the list does not carry: one on the user's server reads as typed, with its server. */
export function unlistedModelName(id: string): string {
  const scoped = parseEndpointModelId(id);
  const label = scoped && getEndpoint(scoped.endpointId)?.label;
  return scoped && label ? `${scoped.modelId} · ${label}` : id;
}

export function useModelPickerController(): ModelPickerController {
  const {
    updateChatSettings,
    chats,
    selectedChatId,
    ui,
    setUI,
    favoriteModelIds,
    toggleFavoriteModel,
    models,
    zdrModelIds,
    zdrProviderIds,
    nextOverrides,
  } = useChatStore(
    (state) => ({
      updateChatSettings: state.updateChatSettings,
      chats: state.chats,
      selectedChatId: state.selectedChatId,
      ui: state.ui,
      setUI: state.setUI,
      favoriteModelIds: state.favoriteModelIds,
      toggleFavoriteModel: state.toggleFavoriteModel,
      models: state.models,
      zdrModelIds: state.zdrModelIds,
      zdrProviderIds: state.zdrProviderIds,
      nextOverrides: selectNextOverrides(state),
    }),
    shallow,
  );

  const chat = chats.find((c) => c.id === selectedChatId);
  const curated = useCuratedModels();
  const defaultModelId = useDefaultModelId();
  const allowedIds = useMemo(() => {
    const ids = (models || [])
      .filter((model) => isModelEndpointAvailable(model))
      .map((model) => model.id);
    return new Set(ids);
  }, [models]);

  const customOptions = useMemo(() => {
    return (favoriteModelIds || [])
      .filter((id: string) => allowedIds.has(id))
      .map((id: string) => ({ id, name: id }));
  }, [favoriteModelIds, allowedIds]);

  const allOptions = useMemo(() => {
    const defaultCurated = curated.find((m) => m.id === defaultModelId);
    // With no model list yet (no key), "Claude Haiku 5.5", not the bare id.
    const defaultName = defaultCurated?.name || formatModelLabel({ fallbackId: defaultModelId });
    const injectedDefault = [{ id: defaultModelId, name: defaultName }];
    return [...injectedDefault, ...curated, ...customOptions].reduce(
      (acc: ModelPickerOption[], m: ModelPickerOption) => {
        if (!acc.find((x) => x.id === m.id)) acc.push(m);
        return acc;
      },
      [],
    );
  }, [customOptions, curated, defaultModelId]);

  const pinnedModelId = useMemo(() => resolveDefaultModelId(models || []), [models]);

  const options = useMemo(() => {
    if (ui?.zdrOnly !== true) return allOptions;
    return allOptions.filter((m) => m.id === pinnedModelId || allowedIds.has(m.id));
  }, [allOptions, ui?.zdrOnly, allowedIds, pinnedModelId]);

  const zdrHiddenCount = useMemo(() => {
    if (ui?.zdrOnly !== true) return 0;
    return allOptions.filter((m) => m.id !== pinnedModelId && !allowedIds.has(m.id)).length;
  }, [ui?.zdrOnly, allOptions, allowedIds, pinnedModelId]);

  const selectedIds = useMemo(() => {
    const fromChat = chat
      ? [chat.settings.modelId || defaultModelId]
      : [nextOverrides.modelId || defaultModelId];
    const cleaned = fromChat.filter((id): id is string => typeof id === 'string' && id.length > 0);

    const deduped: string[] = [];
    for (const id of cleaned) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    if (deduped.length === 0) deduped.push(defaultModelId);
    return deduped;
  }, [chat, nextOverrides.modelId, defaultModelId]);

  const selectedId = selectedIds[0];
  // Always the model the chat uses, even one zero data retention keeps off
  // the list: a stand-in here would name a model the turn never calls.
  const current =
    allOptions.find((o) => o.id === selectedId) ||
    (selectedId ? { id: selectedId, name: unlistedModelName(selectedId) } : undefined) ||
    options[0];
  const currentUnavailable = ui?.zdrOnly === true && !!current && !allowedIds.has(current.id);

  const setModels = (modelIds: string[]) => {
    const cleaned = modelIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    const deduped: string[] = [];
    for (const id of cleaned) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    const final = deduped.length ? deduped : [defaultModelId];
    const primary = final[0];
    if (chat) {
      updateChatSettings({ modelId: primary });
    } else {
      setUI({ overrides: { modelId: primary } });
    }
  };

  const modelMap = useMemo(() => {
    const map = new Map();
    for (const model of models || []) {
      if (!isModelEndpointAvailable(model)) continue;
      map.set(model.id, model);
    }
    return map;
  }, [models]);

  return {
    chat,
    options,
    allOptions,
    current,
    selectedId,
    selectedIds,
    setModels,
    toggleFavoriteModel,
    favoriteModelIds: favoriteModelIds || [],
    modelMap,
    ui,
    zdrModelIds,
    zdrProviderIds,
    setUI,
    zdrHiddenCount,
    zdrRestricted: ui?.zdrOnly === true,
    currentUnavailable,
  };
}
