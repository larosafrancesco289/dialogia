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
  const [temperature, setTemperature] = useState<number | undefined>(chat?.settings.temperature);
  const [topP, setTopP] = useState<number | undefined>(chat?.settings.top_p);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(chat?.settings.max_tokens);
  // Local string mirrors to avoid type=number focus/validation quirks
  const [temperatureStr, setTemperatureStr] = useState<string>(
    chat?.settings.temperature != null ? String(chat.settings.temperature) : '',
  );
  const [topPStr, setTopPStr] = useState<string>(
    chat?.settings.top_p != null ? String(chat.settings.top_p) : '',
  );
  const [maxTokensStr, setMaxTokensStr] = useState<string>(
    chat?.settings.max_tokens != null ? String(chat.settings.max_tokens) : '',
  );
  const [reasoningEffort, setReasoningEffort] = useState<ChatSettings['reasoning_effort']>(
    chat?.settings.reasoning_effort,
  );
  const [reasoningTokens, setReasoningTokens] = useState<number | undefined>(
    chat?.settings.reasoning_tokens,
  );
  const [reasoningTokensStr, setReasoningTokensStr] = useState<string>(
    chat?.settings.reasoning_tokens != null ? String(chat.settings.reasoning_tokens) : '',
  );
  const [tutorDefaultModel, setTutorDefaultModel] = useState<string>(
    ui?.tutor.defaultModelId || DEFAULT_TUTOR_MODEL_ID,
  );
  const [showThinking, setShowThinking] = useState<boolean>(
    chat?.settings.show_thinking_by_default ?? false,
  );
  const [showStats, setShowStats] = useState<boolean>(chat?.settings.show_stats ?? false);
  const [showToolCallLog, setShowToolCallLog] = useState<boolean>(
    chat?.settings.showToolCallLog ?? false,
  );
  const [showDebugRawJson, setShowDebugRawJson] = useState<boolean>(
    chat?.settings.showDebugRawJson ?? true,
  );
  const [presets, setPresets] = useState<SystemPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  // Keep local state in sync when switching chats or reopening the drawer
  useEffect(() => {
    setSystem(chat?.settings.system ?? '');
    setTemperature(chat?.settings.temperature);
    setTopP(chat?.settings.top_p);
    setMaxTokens(chat?.settings.max_tokens);
    setTemperatureStr(chat?.settings.temperature != null ? String(chat.settings.temperature) : '');
    setTopPStr(chat?.settings.top_p != null ? String(chat.settings.top_p) : '');
    setMaxTokensStr(chat?.settings.max_tokens != null ? String(chat.settings.max_tokens) : '');
    setReasoningEffort(chat?.settings.reasoning_effort);
    setReasoningTokens(chat?.settings.reasoning_tokens);
    setReasoningTokensStr(
      chat?.settings.reasoning_tokens != null ? String(chat.settings.reasoning_tokens) : '',
    );
    setShowThinking(chat?.settings.show_thinking_by_default ?? false);
    setShowStats(chat?.settings.show_stats ?? false);
    setShowToolCallLog(chat?.settings.showToolCallLog ?? false);
    setShowDebugRawJson(chat?.settings.showDebugRawJson ?? true);
    setTutorDefaultModel(ui?.tutor.defaultModelId || DEFAULT_TUTOR_MODEL_ID);
  }, [
    chat?.id,
    chat?.settings.system,
    chat?.settings.temperature,
    chat?.settings.top_p,
    chat?.settings.max_tokens,
    chat?.settings.reasoning_effort,
    chat?.settings.reasoning_tokens,
    chat?.settings.show_thinking_by_default,
    chat?.settings.show_stats,
    ui?.tutor.defaultModelId,
    chat?.settings.showToolCallLog,
    chat?.settings.showDebugRawJson,
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
