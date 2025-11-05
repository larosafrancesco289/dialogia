import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { getDefaultZdrOnly, getRoutePreferenceDefault } from '@/lib/config';
import type { UIState } from '@/lib/store/types';

const EPHEMERAL_DEFAULTS: Partial<UIState> = {
  nextModel: undefined,
  nextSearchEnabled: false,
  nextSearchProvider: undefined,
  nextDeepResearch: false,
  nextTutorMode: false,
  nextTutorNudge: undefined,
  nextReasoningEffort: undefined,
  nextReasoningTokens: undefined,
  nextSystem: undefined,
  nextTemperature: undefined,
  nextTopP: undefined,
  nextMaxTokens: undefined,
  nextShowThinking: undefined,
  nextShowStats: undefined,
  nextShowToolCallLog: undefined,
  nextShowDebugRawJson: undefined,
  nextParallelModels: undefined,
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
    learnerModelDebugByMessageId: {},
    forceTutorMode: false,
    ...EPHEMERAL_DEFAULTS,
    tutorContextMode: 'full',
    zdrOnly: getDefaultZdrOnly(),
    routePreference: getRoutePreferenceDefault(),
    experimentalBrave: false,
    experimentalDeepResearch: false,
    experimentalTutor: true,
    enableMultiModelChat: false,
    braveByMessageId: {},
    tutorByMessageId: {},
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
