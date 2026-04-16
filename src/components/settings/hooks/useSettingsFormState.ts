'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import type { SystemPreset } from '@/lib/presets';
import type { ChatSettings } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { loadSystemPresets } from '@/lib/settings/systemPresets';

type SettingsFormStateArgs = {
  ui: UIState;
};

const DEFAULT_CHAT_UI_SETTINGS = {
  showThinkingByDefault: false,
  showStats: false,
  showToolCallLog: false,
  showDebugRawJson: true,
} as const;

export function useSettingsFormState({ ui }: SettingsFormStateArgs) {
  const chatDefaults = ui.chatDefaults;
  const [system, setSystem] = useState(chatDefaults?.system ?? DEFAULT_BASE_SYSTEM);
  const [temperature, setTemperature] = useState<number | undefined>(
    chatDefaults?.generation?.temperature,
  );
  const [topP, setTopP] = useState<number | undefined>(chatDefaults?.generation?.topP);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(
    chatDefaults?.generation?.maxTokens,
  );
  // Local string mirrors to avoid type=number focus/validation quirks
  const [temperatureStr, setTemperatureStr] = useState<string>(
    chatDefaults?.generation?.temperature != null
      ? String(chatDefaults.generation.temperature)
      : '',
  );
  const [topPStr, setTopPStr] = useState<string>(
    chatDefaults?.generation?.topP != null ? String(chatDefaults.generation.topP) : '',
  );
  const [maxTokensStr, setMaxTokensStr] = useState<string>(
    chatDefaults?.generation?.maxTokens != null ? String(chatDefaults.generation.maxTokens) : '',
  );
  const [reasoningEffort, setReasoningEffort] = useState<
    ChatSettings['generation']['reasoningEffort']
  >(chatDefaults?.generation?.reasoningEffort);
  const [reasoningTokens, setReasoningTokens] = useState<number | undefined>(
    chatDefaults?.generation?.reasoningTokens,
  );
  const [reasoningTokensStr, setReasoningTokensStr] = useState<string>(
    chatDefaults?.generation?.reasoningTokens != null
      ? String(chatDefaults.generation.reasoningTokens)
      : '',
  );
  const [tutorDefaultModel, setTutorDefaultModel] = useState<string>(
    ui?.tutor.defaultModelId || DEFAULT_TUTOR_MODEL_ID,
  );
  const [showThinking, setShowThinking] = useState<boolean>(
    chatDefaults?.ui?.showThinkingByDefault ?? DEFAULT_CHAT_UI_SETTINGS.showThinkingByDefault,
  );
  const [showStats, setShowStats] = useState<boolean>(
    chatDefaults?.ui?.showStats ?? DEFAULT_CHAT_UI_SETTINGS.showStats,
  );
  const [showToolCallLog, setShowToolCallLog] = useState<boolean>(
    chatDefaults?.ui?.showToolCallLog ?? DEFAULT_CHAT_UI_SETTINGS.showToolCallLog,
  );
  const [showDebugRawJson, setShowDebugRawJson] = useState<boolean>(
    chatDefaults?.ui?.showDebugRawJson ?? DEFAULT_CHAT_UI_SETTINGS.showDebugRawJson,
  );
  const [presets, setPresets] = useState<SystemPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  // Keep local state in sync when switching chats or reopening the drawer
  useEffect(() => {
    setSystem(chatDefaults?.system ?? DEFAULT_BASE_SYSTEM);
    setTemperature(chatDefaults?.generation?.temperature);
    setTopP(chatDefaults?.generation?.topP);
    setMaxTokens(chatDefaults?.generation?.maxTokens);
    setTemperatureStr(
      chatDefaults?.generation?.temperature != null
        ? String(chatDefaults.generation.temperature)
        : '',
    );
    setTopPStr(chatDefaults?.generation?.topP != null ? String(chatDefaults.generation.topP) : '');
    setMaxTokensStr(
      chatDefaults?.generation?.maxTokens != null ? String(chatDefaults.generation.maxTokens) : '',
    );
    setReasoningEffort(chatDefaults?.generation?.reasoningEffort);
    setReasoningTokens(chatDefaults?.generation?.reasoningTokens);
    setReasoningTokensStr(
      chatDefaults?.generation?.reasoningTokens != null
        ? String(chatDefaults.generation.reasoningTokens)
        : '',
    );
    setShowThinking(
      chatDefaults?.ui?.showThinkingByDefault ?? DEFAULT_CHAT_UI_SETTINGS.showThinkingByDefault,
    );
    setShowStats(chatDefaults?.ui?.showStats ?? DEFAULT_CHAT_UI_SETTINGS.showStats);
    setShowToolCallLog(
      chatDefaults?.ui?.showToolCallLog ?? DEFAULT_CHAT_UI_SETTINGS.showToolCallLog,
    );
    setShowDebugRawJson(
      chatDefaults?.ui?.showDebugRawJson ?? DEFAULT_CHAT_UI_SETTINGS.showDebugRawJson,
    );
    setTutorDefaultModel(ui?.tutor.defaultModelId || DEFAULT_TUTOR_MODEL_ID);
  }, [
    chatDefaults?.system,
    chatDefaults?.generation?.temperature,
    chatDefaults?.generation?.topP,
    chatDefaults?.generation?.maxTokens,
    chatDefaults?.generation?.reasoningEffort,
    chatDefaults?.generation?.reasoningTokens,
    chatDefaults?.ui?.showThinkingByDefault,
    chatDefaults?.ui?.showStats,
    chatDefaults?.ui?.showToolCallLog,
    chatDefaults?.ui?.showDebugRawJson,
    ui?.tutor.defaultModelId,
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
