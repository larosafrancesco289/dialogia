// Module: store/chatSettings
// Responsibility: Map transient UI preferences into chat settings for new conversations.

import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type { ChatSettings } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { applyTutorDefaults, normalizeParallelModels } from '@/lib/store/normalize';

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
  const showToolCallLog = ui.nextShowToolCallLog ?? previous?.showToolCallLog ?? false;
  const showDebugRawJson = ui.nextShowDebugRawJson ?? previous?.showDebugRawJson ?? true;

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
  const normalizedParallel = normalizeParallelModels(baseModel, parallelFromUi);

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
    showToolCallLog,
    showDebugRawJson,
    search_enabled,
    search_provider,
    tutor_mode,
  };

  if (tutor_mode) {
    const ensured = applyTutorDefaults({
      ui,
      chat: { settings },
      fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    });
    Object.assign(settings, ensured.nextSettings, {
      tutor_mode: true,
      parallel_models: [],
    });
  }

  return settings;
}
