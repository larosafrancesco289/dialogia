import { useCallback } from 'react';
import { useAutoSave } from '@/components/settings/hooks/useAutoSave';
import {
  applySettingsSavePatch,
  buildSettingsSavePatch,
  type SettingsSaveInput,
} from '@/components/settings/saveSettings';
import type { StoreState } from '@/lib/store/types';

export type SettingsAutoSaveState = {
  saveStatus: ReturnType<typeof useAutoSave>['status'];
  markDirty: () => void;
  createAutoSaveSetter: <T>(setter: (value: T) => void) => (value: T) => void;
  flushPendingSave: () => Promise<void>;
};

export function useSettingsAutoSave(args: {
  setUI: StoreState['setUI'];
  system: SettingsSaveInput['system'];
  reasoningEffort: SettingsSaveInput['reasoningEffort'];
  reasoningTokens: SettingsSaveInput['reasoningTokens'];
  showThinking: SettingsSaveInput['showThinking'];
  showStats: SettingsSaveInput['showStats'];
  showToolCallLog: SettingsSaveInput['showToolCallLog'];
  showDebugRawJson: SettingsSaveInput['showDebugRawJson'];
}): SettingsAutoSaveState {
  const {
    setUI,
    system,
    reasoningEffort,
    reasoningTokens,
    showThinking,
    showStats,
    showToolCallLog,
    showDebugRawJson,
  } = args;

  const performSave = useCallback(() => {
    const patch = buildSettingsSavePatch({
      system,
      reasoningEffort,
      reasoningTokens,
      showThinking,
      showStats,
      showToolCallLog,
      showDebugRawJson,
    });
    applySettingsSavePatch({
      patch,
      setUI,
    });
  }, [
    system,
    reasoningEffort,
    reasoningTokens,
    showThinking,
    showStats,
    showToolCallLog,
    showDebugRawJson,
    setUI,
  ]);

  const {
    status: saveStatus,
    markDirty,
    forceSave,
  } = useAutoSave({
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

  return {
    saveStatus,
    markDirty,
    createAutoSaveSetter,
    flushPendingSave: forceSave,
  };
}
