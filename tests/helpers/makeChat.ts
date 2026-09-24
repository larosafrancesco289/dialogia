import type { Chat, ChatSettingsPatch } from '@/lib/types';

type ChatOverrides = Omit<Partial<Chat>, 'settings'> & { settings?: ChatSettingsPatch };

/**
 * A complete chat with neutral settings. `settings` is a patch merged one level
 * deep, so a test names only the fields it is about; `features.tutor` exists
 * only when the patch gives it.
 */
export function makeChat(overrides: ChatOverrides = {}): Chat {
  const { settings = {}, ...rest } = overrides;
  const { tutor, search } = settings.features ?? {};
  return {
    id: 'chat-1',
    title: 'Chat',
    createdAt: 1,
    updatedAt: 1,
    ...rest,
    settings: {
      modelId: settings.modelId ?? 'provider/model',
      ...(settings.system !== undefined ? { system: settings.system } : {}),
      generation: { ...settings.generation },
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
        ...settings.ui,
      },
      features: {
        search: { enabled: false, provider: 'openrouter', ...search },
        ...(tutor ? { tutor: { ...tutor } } : {}),
      },
    },
  };
}
