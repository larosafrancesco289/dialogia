import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { PINNED_MODEL_ID } from '@/lib/constants';
import { findModelById } from '@/lib/models';
import type { Chat } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import { readNextOverrides } from '@/lib/ui/next';
import { useTierCuratedModels, useTierDefaultModelId } from '@/lib/hooks/useTierModels';
import { useTier } from '@/lib/auth/tierContext';
import { FREE_MODEL_IDS } from '@/data/freeModels';
import { isModelTransportAvailable } from '@/lib/policy/providerAvailability';

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
  removeModelFromDropdown: (id: string) => void;
  toggleFavoriteModel: (id: string) => void;
  favoriteModelIds: string[];
  modelMap: Map<string, ReturnType<typeof findModelById>>;
  ui: StoreState['ui'];
  zdrModelIds?: string[];
  zdrProviderIds?: string[];
  setUI: StoreState['setUI'];
  zdrHiddenCount: number;
  zdrRestricted: boolean;
  enableMultiModelChat: boolean;
};

export function useModelPickerController(): ModelPickerController {
  const {
    updateChatSettings,
    chats,
    selectedChatId,
    ui,
    setUI,
    favoriteModelIds,
    hiddenModelIds,
    removeModelFromDropdown,
    toggleFavoriteModel,
    models,
    zdrModelIds,
    zdrProviderIds,
  } = useChatStore(
    (state) => ({
      updateChatSettings: state.updateChatSettings,
      chats: state.chats,
      selectedChatId: state.selectedChatId,
      ui: state.ui,
      setUI: state.setUI,
      favoriteModelIds: state.favoriteModelIds,
      hiddenModelIds: state.hiddenModelIds,
      removeModelFromDropdown: state.removeModelFromDropdown,
      toggleFavoriteModel: state.toggleFavoriteModel,
      models: state.models,
      zdrModelIds: state.zdrModelIds,
      zdrProviderIds: state.zdrProviderIds,
    }),
    shallow,
  );

  const chat = chats.find((c) => c.id === selectedChatId);
  const curated = useTierCuratedModels();
  const tierDefaultModelId = useTierDefaultModelId();
  const { isFreeTier, isLoading: tierLoading } = useTier();
  const nextOverrides = readNextOverrides(ui);

  const allowedIds = useMemo(() => {
    const ids = (models || [])
      .filter((model) => isModelTransportAvailable(model))
      .map((model) => model.id);
    return new Set(ids);
  }, [models]);

  const customOptions = useMemo(() => {
    return (favoriteModelIds || [])
      .filter((id: string) => allowedIds.has(id))
      .map((id: string) => ({ id, name: id }));
  }, [favoriteModelIds, allowedIds]);

  const allOptions = useMemo(() => {
    // Use tier-aware default model, get the display name from curated models
    const defaultCurated = curated.find((m) => m.id === tierDefaultModelId);
    const defaultName =
      defaultCurated?.name || tierDefaultModelId.split('/').pop() || tierDefaultModelId;
    const injectedDefault = [{ id: tierDefaultModelId, name: defaultName }];
    return [...injectedDefault, ...curated, ...customOptions].reduce(
      (acc: ModelPickerOption[], m: ModelPickerOption) => {
        if (!acc.find((x) => x.id === m.id)) acc.push(m);
        return acc;
      },
      [],
    );
  }, [customOptions, curated, tierDefaultModelId]);

  const options = useMemo(() => {
    const hidden = new Set(hiddenModelIds || []);
    return allOptions.filter((m: ModelPickerOption) => {
      if (m.id === PINNED_MODEL_ID) return true;
      if (hidden.has(m.id)) return false;
      if (ui?.zdrOnly === true) return allowedIds.has(m.id);
      return true;
    });
  }, [allOptions, hiddenModelIds, ui?.zdrOnly, allowedIds]);

  const zdrHiddenCount = useMemo(() => {
    if (ui?.zdrOnly !== true) return 0;
    const hidden = new Set(hiddenModelIds || []);
    let count = 0;
    for (const option of allOptions) {
      if (option.id === PINNED_MODEL_ID) continue;
      if (hidden.has(option.id)) continue;
      if (!allowedIds.has(option.id)) count += 1;
    }
    return count;
  }, [ui?.zdrOnly, hiddenModelIds, allOptions, allowedIds]);

  const selectedIds = useMemo(() => {
    const fromChat = chat
      ? [
          chat.settings.model || tierDefaultModelId,
          ...((chat.settings.parallel_models as string[] | undefined) ?? []),
        ]
      : [
          nextOverrides.model || tierDefaultModelId,
          ...((nextOverrides.parallelModels as string[] | undefined) ?? []),
        ];
    const cleaned = fromChat.filter((id): id is string => typeof id === 'string' && id.length > 0);

    // Validate models for free tier - filter out paid models
    const validated = tierLoading
      ? cleaned
      : isFreeTier
        ? cleaned.filter((id) => FREE_MODEL_IDS.includes(id))
        : cleaned;

    const deduped: string[] = [];
    for (const id of validated) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    if (deduped.length === 0) deduped.push(tierDefaultModelId);
    return deduped;
  }, [
    chat,
    nextOverrides.model,
    nextOverrides.parallelModels,
    tierDefaultModelId,
    isFreeTier,
    tierLoading,
  ]);

  const selectedId = selectedIds[0];
  const effectiveSelectedId =
    ui?.zdrOnly === true && selectedId && !allowedIds.has(selectedId) ? undefined : selectedId;
  const current =
    allOptions.find((o) => o.id === effectiveSelectedId) ||
    (effectiveSelectedId ? { id: effectiveSelectedId, name: effectiveSelectedId } : undefined) ||
    options[0];

  const setModels = (modelIds: string[]) => {
    const cleaned = modelIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    const deduped: string[] = [];
    for (const id of cleaned) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    const final = deduped.length ? deduped : [tierDefaultModelId];
    const [primary, ...rest] = final;
    if (chat) {
      updateChatSettings({ model: primary, parallel_models: rest });
    } else {
      setUI({ overrides: { model: primary, parallelModels: rest } });
    }
  };

  const modelMap = useMemo(() => {
    const map = new Map();
    for (const model of models || []) {
      if (!isModelTransportAvailable(model)) continue;
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
    removeModelFromDropdown,
    toggleFavoriteModel,
    favoriteModelIds: favoriteModelIds || [],
    modelMap,
    ui,
    zdrModelIds,
    zdrProviderIds,
    setUI,
    zdrHiddenCount,
    zdrRestricted: ui?.zdrOnly === true,
    enableMultiModelChat: ui?.flags.enableMultiModelChat === true,
  };
}
