// Module: store/chatSettings
// Responsibility: Map transient UI preferences into chat settings for new conversations.

import type { ChatSettings } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { resolveNewChatSettings } from '@/lib/settings/resolve';

export function deriveChatSettingsFromUi(opts: {
  ui: UIState;
  fallbackModelId: string;
  fallbackSystem?: string;
  lastUsedModelId?: string;
  previous?: ChatSettings;
  tutorEnabled: boolean;
  forceTutorMode: boolean;
}): ChatSettings {
  return resolveNewChatSettings(opts);
}
