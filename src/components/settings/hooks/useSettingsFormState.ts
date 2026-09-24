import { useEffect, useState } from 'react';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import type { SystemPreset } from '@/lib/presets';
import type { ChatSettings } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { loadSystemPresets } from '@/lib/settings/systemPresets';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/settings/chatDefaults';

type SettingsFormStateArgs = {
  ui: UIState;
};

export function useSettingsFormState({ ui }: SettingsFormStateArgs) {
  const chatDefaults = ui.chatDefaults;
  const [system, setSystem] = useState(chatDefaults?.system ?? DEFAULT_BASE_SYSTEM);
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
    ui?.tutor?.defaultModelId || DEFAULT_TUTOR_MODEL_ID,
  );
  const [showThinking, setShowThinking] = useState<boolean>(
    chatDefaults?.ui?.showThinkingByDefault ?? DEFAULT_DISPLAY_PREFERENCES.showThinkingByDefault,
  );
  const [showStats, setShowStats] = useState<boolean>(
    chatDefaults?.ui?.showStats ?? DEFAULT_DISPLAY_PREFERENCES.showStats,
  );
  const [showToolCallLog, setShowToolCallLog] = useState<boolean>(
    chatDefaults?.ui?.showToolCallLog ?? DEFAULT_DISPLAY_PREFERENCES.showToolCallLog,
  );
  const [showDebugRawJson, setShowDebugRawJson] = useState<boolean>(
    chatDefaults?.ui?.showDebugRawJson ?? DEFAULT_DISPLAY_PREFERENCES.showDebugRawJson,
  );
  const [presets, setPresets] = useState<SystemPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  // Keep local state in sync when switching chats or reopening the drawer
  useEffect(() => {
    setSystem(chatDefaults?.system ?? DEFAULT_BASE_SYSTEM);
    setReasoningEffort(chatDefaults?.generation?.reasoningEffort);
    setReasoningTokens(chatDefaults?.generation?.reasoningTokens);
    setReasoningTokensStr(
      chatDefaults?.generation?.reasoningTokens != null
        ? String(chatDefaults.generation.reasoningTokens)
        : '',
    );
    setShowThinking(
      chatDefaults?.ui?.showThinkingByDefault ?? DEFAULT_DISPLAY_PREFERENCES.showThinkingByDefault,
    );
    setShowStats(chatDefaults?.ui?.showStats ?? DEFAULT_DISPLAY_PREFERENCES.showStats);
    setShowToolCallLog(
      chatDefaults?.ui?.showToolCallLog ?? DEFAULT_DISPLAY_PREFERENCES.showToolCallLog,
    );
    setShowDebugRawJson(
      chatDefaults?.ui?.showDebugRawJson ?? DEFAULT_DISPLAY_PREFERENCES.showDebugRawJson,
    );
    setTutorDefaultModel(ui?.tutor?.defaultModelId || DEFAULT_TUTOR_MODEL_ID);
  }, [
    chatDefaults?.system,
    chatDefaults?.generation?.reasoningEffort,
    chatDefaults?.generation?.reasoningTokens,
    chatDefaults?.ui?.showThinkingByDefault,
    chatDefaults?.ui?.showStats,
    chatDefaults?.ui?.showToolCallLog,
    chatDefaults?.ui?.showDebugRawJson,
    ui?.tutor?.defaultModelId,
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
