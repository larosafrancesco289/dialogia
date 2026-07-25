import type { ChatSettings } from '@/lib/types';
import type { StoreState, UIStatePartial } from '@/lib/store/types';

export type SettingsSaveInput = {
  system: string;
  reasoningEffort?: ChatSettings['generation']['reasoningEffort'];
  reasoningTokens?: number;
  showThinking: boolean;
  showStats: boolean;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
};

export type SettingsSavePatch = {
  uiPatch: UIStatePartial;
};

export function buildSettingsSavePatch(input: SettingsSaveInput): SettingsSavePatch {
  return {
    uiPatch: {
      chatDefaults: {
        system: input.system,
        generation: {
          reasoningEffort: input.reasoningEffort,
          reasoningTokens: input.reasoningTokens,
        },
        ui: {
          showThinkingByDefault: input.showThinking,
          showStats: input.showStats,
          showToolCallLog: input.showToolCallLog,
          showDebugRawJson: input.showDebugRawJson,
        },
      },
    },
  };
}

export function applySettingsSavePatch(args: {
  patch: SettingsSavePatch;
  setUI: StoreState['setUI'];
  onClose?: () => void;
}) {
  args.setUI(args.patch.uiPatch);
  args.onClose?.();
}
