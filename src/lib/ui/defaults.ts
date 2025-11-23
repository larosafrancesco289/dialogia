import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { getDefaultZdrOnly, getRoutePreferenceDefault } from '@/lib/config';
import type { UIState } from '@/lib/store/types';

const EPHEMERAL_DEFAULTS: Partial<UIState> = {
  next: undefined,
};

export function buildDefaultUIState(overrides?: Partial<UIState>): UIState {
  const base: UIState = {
    showSettings: false,
    isStreaming: false,
    notice: undefined,
    sidebarCollapsed: false,
    debugMode: false,
    debugByMessageId: {},
    autoReasoningModelIds: {},
    tutorDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    tutorThesisMode: true,
    tutorResearchMode: 'plan_plus_model',
    learnerModelDebugByMessageId: {},
    forceTutorMode: false,
    ...EPHEMERAL_DEFAULTS,
    tutorContextMode: 'full',
    zdrOnly: getDefaultZdrOnly(),
    routePreference: getRoutePreferenceDefault(),
    experimentalBrave: false,
    experimentalTutor: true,
    enableMultiModelChat: false,
    braveByMessageId: {},
    tutorByMessageId: {},
    tutorToolUsageByChatId: {},
    tutorProfileByChatId: {},
    tutorWelcomeByChatId: {},
    tutorWelcomePreview: undefined,
    tutorGreetedByChatId: {},
    planSheetOpen: false,
    planSheetPlanOverride: null,
    planGenerationByChatId: {},
  };

  return overrides ? { ...base, ...overrides } : base;
}

export function resetEphemeralUi(next?: UIState): UIState {
  const target = next ? { ...next } : buildDefaultUIState();
  return { ...target, ...EPHEMERAL_DEFAULTS };
}
