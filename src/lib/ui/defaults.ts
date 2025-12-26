import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { getDefaultZdrOnly, getRoutePreferenceDefault } from '@/lib/config';
import type { UIState } from '@/lib/store/types';

const EPHEMERAL_DEFAULTS: Partial<UIState> = {
  overrides: undefined,
};

export function buildDefaultUIState(overrides?: Partial<UIState>): UIState {
  const base: UIState = {
    showSettings: false,
    isStreaming: false,
    notice: undefined,
    sidebarCollapsed: false,
    ...EPHEMERAL_DEFAULTS,
    zdrOnly: getDefaultZdrOnly(),
    routePreference: getRoutePreferenceDefault(),
    flags: {
      experimentalBrave: false,
      experimentalTutor: true,
      enableMultiModelChat: false,
    },
    debug: {
      mode: false,
      byMessageId: {},
      autoReasoningModelIds: {},
      learnerModelDebugByMessageId: {},
    },
    search: {
      braveByMessageId: {},
    },
    tutor: {
      byMessageId: {},
      profileByChatId: {},
      welcomeByChatId: {},
      welcomePreview: undefined,
      greetedByChatId: {},
      toolUsageByChatId: {},
      contextMode: 'full',
      defaultModelId: DEFAULT_TUTOR_MODEL_ID,
      forceMode: false,
      thesisMode: true,
      researchMode: 'plan_plus_model',
    },
    plan: {
      sheetOpen: false,
      sheetPlanOverride: null,
      generationByChatId: {},
    },
  };

  return overrides ? { ...base, ...overrides } : base;
}

export function resetEphemeralUi<T extends { overrides?: UIState['overrides'] }>(next: T): T {
  return { ...next, overrides: undefined };
}
