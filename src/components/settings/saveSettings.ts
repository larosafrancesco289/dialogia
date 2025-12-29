import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { readNextOverrides } from '@/lib/ui/next';
import type { Chat, ChatSettings } from '@/lib/types';
import type { StoreState, UIState } from '@/lib/store/types';

export type SettingsSaveInput = {
  chat?: Chat;
  ui: UIState;
  system: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: ChatSettings['reasoning_effort'];
  reasoningTokens?: number;
  showThinking: boolean;
  showStats: boolean;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
  tutorDefaultModel: string;
};

export type SettingsSavePatch = {
  uiPatch: Partial<UIState>;
  chatSettingsPatch?: Partial<ChatSettings>;
};

export function buildSettingsSavePatch(input: SettingsSaveInput): SettingsSavePatch {
  const trimmedTutorModel = input.tutorDefaultModel.trim() || DEFAULT_TUTOR_MODEL_ID;
  const uiPatch: Partial<UIState> = { tutor: { defaultModelId: trimmedTutorModel } };

  if (input.chat) {
    const chatSettingsPatch: Partial<ChatSettings> = {
      system: input.system,
      temperature: input.temperature,
      top_p: input.topP,
      max_tokens: input.maxTokens,
      reasoning_effort: input.reasoningEffort,
      reasoning_tokens: input.reasoningTokens,
      show_thinking_by_default: input.showThinking,
      show_stats: input.showStats,
      showToolCallLog: input.showToolCallLog,
      showDebugRawJson: input.showDebugRawJson,
      ...(input.chat.settings.tutor_mode || input.ui?.tutor.forceMode
        ? { tutor_default_model: trimmedTutorModel }
        : {}),
    };
    return { uiPatch, chatSettingsPatch };
  }

  const provider = readNextOverrides(input.ui).search?.provider ?? 'openrouter';
  return {
    uiPatch: {
      ...uiPatch,
      overrides: {
        system: input.system,
        temperature: input.temperature,
        topP: input.topP,
        maxTokens: input.maxTokens,
        reasoning: {
          effort: input.reasoningEffort,
          tokens: input.reasoningTokens,
        },
        show: {
          thinking: input.showThinking,
          stats: input.showStats,
          toolCallLog: input.showToolCallLog,
          debugRawJson: input.showDebugRawJson,
        },
        search: { provider },
      },
    },
  };
}

export function applySettingsSavePatch(args: {
  patch: SettingsSavePatch;
  setUI: StoreState['setUI'];
  updateChatSettings: StoreState['updateChatSettings'];
  onClose?: () => void;
}) {
  const { patch, setUI, updateChatSettings, onClose } = args;
  if (patch.uiPatch) setUI(patch.uiPatch);
  if (patch.chatSettingsPatch) void updateChatSettings(patch.chatSettingsPatch);
  onClose?.();
}
