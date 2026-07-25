import type { Chat } from '@/lib/types';

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
