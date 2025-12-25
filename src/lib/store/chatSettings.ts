// Module: store/chatSettings
// Responsibility: Map transient UI preferences into chat settings for new conversations.

import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/policy';
import type { ChatSettings } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { applyTutorDefaults, normalizeParallelModels } from '@/lib/store/normalize';
import { readNextOverrides } from '@/lib/ui/next';

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
    fallbackSystem = DEFAULT_BASE_SYSTEM,
    lastUsedModelId,
    previous,
    braveEnabled,
    tutorEnabled,
    forceTutorMode,
  } = opts;

  const next = readNextOverrides(ui);
  const baseModel = next.model ?? previous?.model ?? lastUsedModelId ?? fallbackModelId;
  const system = next.system ?? previous?.system ?? fallbackSystem;
  const temperature = next.temperature ?? previous?.temperature;
  const top_p = next.topP ?? previous?.top_p;
  const max_tokens = next.maxTokens ?? previous?.max_tokens;
  const reasoning_effort = next.reasoning?.effort ?? previous?.reasoning_effort ?? undefined;
  const reasoning_tokens = next.reasoning?.tokens ?? previous?.reasoning_tokens;
  const show_thinking_by_default =
    next.show?.thinking ?? previous?.show_thinking_by_default ?? false;
  const show_stats = next.show?.stats ?? previous?.show_stats ?? false;
  const showToolCallLog = next.show?.toolCallLog ?? previous?.showToolCallLog ?? false;
  const showDebugRawJson = next.show?.debugRawJson ?? previous?.showDebugRawJson ?? true;

  const search_enabled = next.search?.enabled ?? previous?.search_enabled ?? false;
  const nextProvider = next.search?.provider ?? previous?.search_provider;
  const search_provider = braveEnabled && nextProvider === 'brave' ? 'brave' : 'openrouter';

  const tutor_mode = forceTutorMode
    ? true
    : tutorEnabled
      ? (next.tutorMode ?? previous?.tutor_mode ?? false)
      : false;

  const parallelFromUi = Array.isArray(next.parallelModels)
    ? next.parallelModels
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
