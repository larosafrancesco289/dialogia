import type { Chat } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type { ModuleSettingsDefaults, ModuleSettingsPhase } from '@/lib/settings/moduleDefaults';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';

type TutorDefaultsUi = {
  tutor?: {
    defaultModelId?: string;
  };
};

type ApplyTutorDefaultsArgs = {
  ui?: TutorDefaultsUi;
  chat: Pick<Chat, 'settings'>;
  fallbackDefaultModelId: string;
};

export function applyTutorDefaults({ ui, chat, fallbackDefaultModelId }: ApplyTutorDefaultsArgs): {
  nextSettings: Chat['settings'];
  changed: boolean;
  defaultModelId: string;
} {
  const currentSettings = chat.settings ?? ({} as Chat['settings']);
  const next: Chat['settings'] = {
    ...currentSettings,
    features: {
      ...currentSettings.features,
      search: {
        ...currentSettings.features?.search,
      },
      tutor: {
        ...currentSettings.features?.tutor,
      },
    },
  };
  const tutorDefaultModelId =
    (ui?.tutor?.defaultModelId as string | undefined) ||
    (currentSettings.features?.tutor?.defaultModelId as string | undefined) ||
    fallbackDefaultModelId;

  let changed = false;

  if (next.modelId !== tutorDefaultModelId) {
    next.modelId = tutorDefaultModelId;
    changed = true;
  }

  if (next.features.tutor?.defaultModelId !== tutorDefaultModelId) {
    next.features.tutor = { ...next.features.tutor, defaultModelId: tutorDefaultModelId };
    changed = true;
  }

  if (next.features.tutor?.enableLearnerModel !== true) {
    next.features.tutor = { ...next.features.tutor, enableLearnerModel: true };
    changed = true;
  }

  return {
    nextSettings: next,
    changed,
    defaultModelId: tutorDefaultModelId,
  };
}

/**
 * The tutor module's `AppModule.settingsDefaults`. Applies only when the chat has
 * tutor mode on, so a non-tutor chat is returned untouched.
 */
export function tutorSettingsDefaults(args: {
  chat: Pick<Chat, 'settings'>;
  ui?: UiSnapshot;
  phase: ModuleSettingsPhase;
}): ModuleSettingsDefaults | undefined {
  const enabled = !!args.chat.settings?.features?.tutor?.enabled;
  // The force-mode preference may switch tutor on, but only while settings are being
  // written — never on a plain read, which would flip a user's existing chats.
  const forcing = args.phase === 'write' && !!args.ui?.tutor?.forceMode;
  if (!enabled && !forcing) return undefined;

  const { nextSettings, changed, defaultModelId } = applyTutorDefaults({
    ui: args.ui,
    chat: args.chat,
    fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
  });
  if (!forcing || enabled) {
    return { nextSettings, changed, preferredModelId: defaultModelId };
  }
  return {
    nextSettings: {
      ...nextSettings,
      features: {
        ...nextSettings.features,
        tutor: { ...nextSettings.features.tutor, enabled: true },
      },
    },
    changed: true,
    preferredModelId: defaultModelId,
  };
}
