'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type { SystemPreset } from '@/lib/presets';
import type { Chat, ChatSettings } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { loadSystemPresets } from '@/lib/settings/systemPresets';

type SettingsFormStateArgs = {
  chat?: Chat;
  ui: UIState;
};

export function useSettingsFormState({ chat, ui }: SettingsFormStateArgs) {
  const [system, setSystem] = useState(chat?.settings.system ?? '');
  const [temperature, setTemperature] = useState<number | undefined>(
    chat?.settings.generation.temperature,
  );
  const [topP, setTopP] = useState<number | undefined>(chat?.settings.generation.topP);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(
    chat?.settings.generation.maxTokens,
  );
  // Local string mirrors to avoid type=number focus/validation quirks
  const [temperatureStr, setTemperatureStr] = useState<string>(
    chat?.settings.generation.temperature != null
      ? String(chat.settings.generation.temperature)
      : '',
  );
  const [topPStr, setTopPStr] = useState<string>(
    chat?.settings.generation.topP != null ? String(chat.settings.generation.topP) : '',
  );
  const [maxTokensStr, setMaxTokensStr] = useState<string>(
    chat?.settings.generation.maxTokens != null ? String(chat.settings.generation.maxTokens) : '',
  );
  const [reasoningEffort, setReasoningEffort] = useState<
    ChatSettings['generation']['reasoningEffort']
  >(chat?.settings.generation.reasoningEffort);
  const [reasoningTokens, setReasoningTokens] = useState<number | undefined>(
    chat?.settings.generation.reasoningTokens,
  );
  const [reasoningTokensStr, setReasoningTokensStr] = useState<string>(
    chat?.settings.generation.reasoningTokens != null
      ? String(chat.settings.generation.reasoningTokens)
      : '',
  );
  const [tutorDefaultModel, setTutorDefaultModel] = useState<string>(
    chat?.settings.features.tutor.defaultModelId ||
      ui?.tutor.defaultModelId ||
      DEFAULT_TUTOR_MODEL_ID,
  );
  const [showThinking, setShowThinking] = useState<boolean>(
    chat?.settings.ui.showThinkingByDefault ?? false,
  );
  const [showStats, setShowStats] = useState<boolean>(chat?.settings.ui.showStats ?? false);
  const [showToolCallLog, setShowToolCallLog] = useState<boolean>(
    chat?.settings.ui.showToolCallLog ?? false,
  );
  const [showDebugRawJson, setShowDebugRawJson] = useState<boolean>(
    chat?.settings.ui.showDebugRawJson ?? true,
  );
  const [presets, setPresets] = useState<SystemPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  // Keep local state in sync when switching chats or reopening the drawer
  useEffect(() => {
    setSystem(chat?.settings.system ?? '');
    setTemperature(chat?.settings.generation.temperature);
    setTopP(chat?.settings.generation.topP);
    setMaxTokens(chat?.settings.generation.maxTokens);
    setTemperatureStr(
      chat?.settings.generation.temperature != null
        ? String(chat.settings.generation.temperature)
        : '',
    );
    setTopPStr(chat?.settings.generation.topP != null ? String(chat.settings.generation.topP) : '');
    setMaxTokensStr(
      chat?.settings.generation.maxTokens != null ? String(chat.settings.generation.maxTokens) : '',
    );
    setReasoningEffort(chat?.settings.generation.reasoningEffort);
    setReasoningTokens(chat?.settings.generation.reasoningTokens);
    setReasoningTokensStr(
      chat?.settings.generation.reasoningTokens != null
        ? String(chat.settings.generation.reasoningTokens)
        : '',
    );
    setShowThinking(chat?.settings.ui.showThinkingByDefault ?? false);
    setShowStats(chat?.settings.ui.showStats ?? false);
    setShowToolCallLog(chat?.settings.ui.showToolCallLog ?? false);
    setShowDebugRawJson(chat?.settings.ui.showDebugRawJson ?? true);
    setTutorDefaultModel(
      chat?.settings.features.tutor.defaultModelId ||
        ui?.tutor.defaultModelId ||
        DEFAULT_TUTOR_MODEL_ID,
    );
  }, [
    chat?.id,
    chat?.settings.system,
    chat?.settings.generation.temperature,
    chat?.settings.generation.topP,
    chat?.settings.generation.maxTokens,
    chat?.settings.generation.reasoningEffort,
    chat?.settings.generation.reasoningTokens,
    chat?.settings.ui.showThinkingByDefault,
    chat?.settings.ui.showStats,
    ui?.tutor.defaultModelId,
    chat?.settings.ui.showToolCallLog,
    chat?.settings.ui.showDebugRawJson,
    chat?.settings.features.tutor.defaultModelId,
  ]);

  // Load saved system prompt presets on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await loadSystemPresets();
      if (!mounted) return;
      setPresets(list);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return {
    system,
    setSystem,
    temperature,
    setTemperature,
    topP,
    setTopP,
    maxTokens,
    setMaxTokens,
    temperatureStr,
    setTemperatureStr,
    topPStr,
    setTopPStr,
    maxTokensStr,
    setMaxTokensStr,
    reasoningEffort,
    setReasoningEffort,
    reasoningTokens,
    setReasoningTokens,
    reasoningTokensStr,
    setReasoningTokensStr,
    tutorDefaultModel,
    setTutorDefaultModel,
    showThinking,
    setShowThinking,
    showStats,
    setShowStats,
    showToolCallLog,
    setShowToolCallLog,
    showDebugRawJson,
    setShowDebugRawJson,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId,
  };
}
