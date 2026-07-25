import type { ChatDefaults, TutorProfile } from '@/lib/types';
import type {
  LearnerModelDebugEntry as ContractLearnerModelDebugEntry,
  TutorToolUsageSnapshot,
  UiDebugSnapshot,
  UiFlagsSnapshot,
  UiMobileSnapshot,
  UiPlanSnapshot,
  UiSearchSnapshot,
  UiSnapshot,
  UiTutorSnapshot,
} from '@/lib/contracts/ui';

export type TutorToolUsage = TutorToolUsageSnapshot;
export type LearnerModelDebugEntry = ContractLearnerModelDebugEntry;

export type UIFlags = UiFlagsSnapshot;
export type UIDebugState = UiDebugSnapshot;
export type UISearchState = UiSearchSnapshot;
export type UIPlanState = UiPlanSnapshot;
export type UIMobileState = UiMobileSnapshot;
export type { MobileTab } from '@/lib/contracts/ui';

export type UITutorState = UiTutorSnapshot & {
  profileByChatId?: Record<string, TutorProfile>;
  welcomeByChatId?: Record<
    string,
    {
      status: 'idle' | 'loading' | 'ready' | 'error';
      message?: string;
      error?: string;
      generatedAt?: number;
    }
  >;
  welcomePreview?: {
    status: 'idle' | 'loading' | 'ready' | 'error';
    message?: string;
    error?: string;
    generatedAt?: number;
  };
  greetedByChatId?: Record<string, boolean>;
  contextMode?: 'summary' | 'full';
};

export type PersistedUiState = {
  showSettings: UiSnapshot['showSettings'];
  sidebarCollapsed?: boolean;
  zdrOnly?: UiSnapshot['zdrOnly'];
  messageTimestamps?: UiSnapshot['messageTimestamps'];
  dynamicDefaultResolutions?: UiSnapshot['dynamicDefaultResolutions'];
  chatDefaults?: ChatDefaults;
  flags?: Pick<UIFlags, 'experimentalTutor'>;
  debug?: Pick<UIDebugState, 'mode'>;
  tutor?: Pick<UITutorState, 'contextMode' | 'defaultModelId' | 'forceMode' | 'autoScroll'>;
  plan?: Pick<UIPlanState, 'rightPanelOpen'>;
};

export type SessionUiState = Omit<
  UiSnapshot,
  'flags' | 'debug' | 'tutor' | 'showSettings' | 'zdrOnly'
> & {
  flags: UIFlags;
  debug: UIDebugState;
  tutor: UITutorState;
  composerDraft?: string;
};

export type UIState = SessionUiState & PersistedUiState;

/**
 * Type for setUI partial updates.
 * Allows partial updates for nested state objects like mobile, flags, etc.
 */
export type UIStatePartial = Omit<
  Partial<UIState>,
  'mobile' | 'flags' | 'debug' | 'search' | 'tutor' | 'plan' | 'chatDefaults'
> & {
  mobile?: Partial<UIMobileState>;
  flags?: Partial<UIFlags>;
  debug?: Partial<UIDebugState>;
  search?: Partial<UISearchState>;
  tutor?: Partial<UITutorState>;
  plan?: Partial<UIPlanState>;
  chatDefaults?: ChatDefaults;
};
