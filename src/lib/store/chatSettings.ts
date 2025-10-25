// Module: store/chatSettings
// Responsibility: Map transient UI preferences into chat settings for new conversations.

import {
  DEFAULT_TUTOR_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_FREQUENCY,
} from '@/lib/constants';
import { EMPTY_TUTOR_MEMORY, normalizeTutorMemory } from '@/lib/agent/tutorMemory';
import type { ChatSettings } from '@/lib/types';
import type { UIState } from '@/lib/store/types';

export function deriveChatSettingsFromUi(opts: {
  ui: UIState;
  fallbackModelId: string;
  fallbackSystem?: string;
  lastUsedModelId?: string;
  previous?: ChatSettings;
  braveEnabled: boolean;
  tutorEnabled: boolean;
  forceTutorMode: boolean;
}): ChatSettings {
  const {
    ui,
    fallbackModelId,
    fallbackSystem = 'You are a helpful assistant.',
    lastUsedModelId,
    previous,
    braveEnabled,
    tutorEnabled,
    forceTutorMode,
  } = opts;

  const baseModel = ui.nextModel ?? previous?.model ?? lastUsedModelId ?? fallbackModelId;
  const system = ui.nextSystem ?? previous?.system ?? fallbackSystem;
  const temperature = ui.nextTemperature ?? previous?.temperature;
  const top_p = ui.nextTopP ?? previous?.top_p;
  const max_tokens = ui.nextMaxTokens ?? previous?.max_tokens;
  const reasoning_effort = ui.nextReasoningEffort ?? previous?.reasoning_effort ?? undefined;
  const reasoning_tokens = ui.nextReasoningTokens ?? previous?.reasoning_tokens;
  const show_thinking_by_default =
    ui.nextShowThinking ?? previous?.show_thinking_by_default ?? false;
  const show_stats = ui.nextShowStats ?? previous?.show_stats ?? false;

  const search_enabled = ui.nextSearchEnabled ?? previous?.search_enabled ?? false;
  const nextProvider = ui.nextSearchProvider ?? previous?.search_provider;
  const search_provider =
    braveEnabled && nextProvider === 'brave' ? 'brave' : 'openrouter';

  const tutor_mode = forceTutorMode
    ? true
    : tutorEnabled
      ? (ui.nextTutorMode ?? previous?.tutor_mode ?? false)
      : false;

  const parallelFromUi = Array.isArray(ui.nextParallelModels)
    ? ui.nextParallelModels
    : previous?.parallel_models;
  const normalizedParallel = Array.isArray(parallelFromUi)
    ? Array.from(
        new Set(parallelFromUi.filter((id): id is string => !!id && id !== baseModel)),
      )
    : [];

  const settings: ChatSettings = {
    model: baseModel,
    parallel_models: normalizedParallel,
    system,
    temperature,
    top_p,
    max_tokens,
    reasoning_effort,
    reasoning_tokens,
    show_thinking_by_default,
    show_stats,
    search_enabled,
    search_provider,
    tutor_mode,
  };

  if (tutor_mode) {
    const tutor_default_model =
      ui.tutorDefaultModelId || previous?.tutor_default_model || DEFAULT_TUTOR_MODEL_ID;
    const tutor_memory_model =
      ui.tutorMemoryModelId ||
      previous?.tutor_memory_model ||
      tutor_default_model ||
      DEFAULT_TUTOR_MEMORY_MODEL_ID;
    const baseMemory = ui.tutorGlobalMemory || previous?.tutor_memory || EMPTY_TUTOR_MEMORY;
    settings.model = tutor_default_model;
    settings.parallel_models = [];
    settings.tutor_default_model = tutor_default_model;
    settings.tutor_memory_model = tutor_memory_model;
    settings.tutor_memory = normalizeTutorMemory(baseMemory);
    settings.tutor_memory_version = previous?.tutor_memory_version ?? 0;
    settings.tutor_memory_message_count = previous?.tutor_memory_message_count ?? 0;
    settings.tutor_memory_frequency =
      ui.tutorMemoryFrequency || previous?.tutor_memory_frequency || DEFAULT_TUTOR_MEMORY_FREQUENCY;
    if (ui.tutorMemoryAutoUpdate === false) settings.tutor_memory_disabled = true;
    else if (previous?.tutor_memory_disabled != null)
      settings.tutor_memory_disabled = previous.tutor_memory_disabled;
  }

  return settings;
}
