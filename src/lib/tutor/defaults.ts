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
  const next: Chat['settings'] = { ...currentSettings };
  const tutorDefaultModelId =
    (ui?.tutor?.defaultModelId as string | undefined) ||
    (currentSettings.tutor_default_model as string | undefined) ||
    fallbackDefaultModelId;

  let changed = false;

  if (next.model !== tutorDefaultModelId) {
    next.model = tutorDefaultModelId;
    changed = true;
  }

  if (next.tutor_default_model !== tutorDefaultModelId) {
    next.tutor_default_model = tutorDefaultModelId;
    changed = true;
  }

  if (next.tutor_thesis_mode !== true) {
    next.tutor_thesis_mode = true;
    changed = true;
  }

  if (!next.tutor_research_mode) {
    next.tutor_research_mode = 'plan_plus_model';
    changed = true;
  }

  if (next.enableLearnerModel !== true) {
    next.enableLearnerModel = true;
    changed = true;
  }

  return {
    nextSettings: next,
    changed,
    defaultModelId: tutorDefaultModelId,
  };
}
