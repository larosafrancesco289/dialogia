'use client';
import { useCallback } from 'react';
import { useAutoSave } from '@/components/settings/hooks/useAutoSave';
import {
  applySettingsSavePatch,
  buildSettingsSavePatch,
  type SettingsSaveInput,
} from '@/components/settings/saveSettings';
import type { StoreState, UIState } from '@/lib/store/types';
import type { Chat } from '@/lib/types';

export type SettingsAutoSaveState = {
  saveStatus: ReturnType<typeof useAutoSave>['status'];
  markDirty: () => void;
  createAutoSaveSetter: <T>(setter: (value: T) => void) => (value: T) => void;
};

export function useSettingsAutoSave(args: {
  chat?: Chat;
  ui: UIState;
  setUI: StoreState['setUI'];
  updateChatSettings: StoreState['updateChatSettings'];
  system: SettingsSaveInput['system'];
  temperature: SettingsSaveInput['temperature'];
  topP: SettingsSaveInput['topP'];
  maxTokens: SettingsSaveInput['maxTokens'];
  reasoningEffort: SettingsSaveInput['reasoningEffort'];
  reasoningTokens: SettingsSaveInput['reasoningTokens'];
  showThinking: SettingsSaveInput['showThinking'];
  showStats: SettingsSaveInput['showStats'];
  showToolCallLog: SettingsSaveInput['showToolCallLog'];
  showDebugRawJson: SettingsSaveInput['showDebugRawJson'];
  tutorDefaultModel: SettingsSaveInput['tutorDefaultModel'];
}): SettingsAutoSaveState {
  const {
    chat,
    ui,
    setUI,
    updateChatSettings,
    system,
    temperature,
    topP,
    maxTokens,
    reasoningEffort,
    reasoningTokens,
    showThinking,
    showStats,
    showToolCallLog,
    showDebugRawJson,
    tutorDefaultModel,
  } = args;

  const performSave = useCallback(() => {
    const patch = buildSettingsSavePatch({
      chat,
      ui,
      system,
      temperature,
      topP,
      maxTokens,
      reasoningEffort,
      reasoningTokens,
      showThinking,
      showStats,
      showToolCallLog,
      showDebugRawJson,
      tutorDefaultModel,
    });
    applySettingsSavePatch({
      patch,
      setUI,
      updateChatSettings,
    });
  }, [
    chat,
    ui,
    system,
    temperature,
    topP,
    maxTokens,
    reasoningEffort,
    reasoningTokens,
    showThinking,
    showStats,
    showToolCallLog,
    showDebugRawJson,
    tutorDefaultModel,
    setUI,
    updateChatSettings,
  ]);

  const { status: saveStatus, markDirty } = useAutoSave({
    delay: 600,
    onSave: performSave,
  });

  const createAutoSaveSetter = useCallback(
    <T>(setter: (value: T) => void) => {
      return (value: T) => {
        setter(value);
        markDirty();
      };
    },
    [markDirty],
  );

  return { saveStatus, markDirty, createAutoSaveSetter };
}
