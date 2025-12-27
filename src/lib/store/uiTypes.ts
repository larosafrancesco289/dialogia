import type { LearningPlan, MessageTutor, TutorProfile, TutorResearchMode } from '@/lib/types';
import type {
  LearnerModelDebugEntry as ContractLearnerModelDebugEntry,
  TutorToolUsageSnapshot,
  UiNextOverrides,
} from '@/lib/contracts/ui';

export type TutorToolUsage = TutorToolUsageSnapshot;

export type UIFlags = {
  experimentalBrave?: boolean;
  experimentalTutor?: boolean;
  enableMultiModelChat?: boolean;
};

export type UIDebugState = {
  mode?: boolean;
  byMessageId?: Record<string, { body: string; createdAt: number }>;
  autoReasoningModelIds?: Record<string, true>;
  learnerModelDebugByMessageId?: Record<string, LearnerModelDebugEntry>;
};

export type LearnerModelDebugEntry = ContractLearnerModelDebugEntry;

export type UISearchState = {
  braveByMessageId?: Record<
    string,
    {
      query: string;
      status: 'loading' | 'done' | 'error';
      results?: { title?: string; url?: string; description?: string }[];
      error?: string;
    }
  >;
};

export type UITutorState = {
  byMessageId?: Record<string, MessageTutor>;
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
  toolUsageByChatId?: Record<string, TutorToolUsage>;
  contextMode?: 'summary' | 'full';
  defaultModelId?: string;
  forceMode?: boolean;
  thesisMode?: boolean;
  researchMode?: TutorResearchMode;
};

export type UIPlanState = {
  sheetOpen?: boolean;
  sheetPlanOverride?: LearningPlan | null;
  generationByChatId?: Record<
    string,
    {
      status: 'idle' | 'loading' | 'ready' | 'error';
      goal?: string;
      startedAt?: number;
      completedAt?: number;
      error?: string;
      modelId?: string;
    }
  >;
};

export type MobileTab = 'chats' | 'new' | 'settings';

export type UIMobileState = {
  /** Currently active tab in bottom navigation */
  activeTab: MobileTab;
  /** Whether the chats sheet is open */
  chatsSheetOpen: boolean;
  /** Whether the settings sheet is open */
  settingsSheetOpen: boolean;
  /** Whether the header is currently visible */
  headerVisible: boolean;
  /** ID of the message currently swiped open (only one at a time) */
  swipeRevealedMessageId: string | null;
  /** Last scroll position for header collapse calculation */
  lastScrollY: number;
  /** Whether the composer input is focused (keyboard open) */
  composerFocused: boolean;
};

export type UIState = {
  showSettings: boolean;
  isStreaming: boolean;
  notice?: string;
  sidebarCollapsed?: boolean;
  overrides?: UiNextOverrides;
  // Privacy preference: only allow/show Zero Data Retention endpoints
  zdrOnly?: boolean;
  // Routing preference: prioritize speed or cost
  routePreference?: 'speed' | 'cost';
  // Pending text to fill into the composer (consumed once read)
  composerDraft?: string;
  flags: UIFlags;
  debug: UIDebugState;
  search: UISearchState;
  tutor: UITutorState;
  plan: UIPlanState;
  // Mobile-specific UI state
  mobile: UIMobileState;
};

/**
 * Type for setUI partial updates.
 * Allows partial updates for nested state objects like mobile, flags, etc.
 */
export type UIStatePartial = Omit<
  Partial<UIState>,
  'mobile' | 'flags' | 'debug' | 'search' | 'tutor' | 'plan'
> & {
  mobile?: Partial<UIMobileState>;
  flags?: Partial<UIFlags>;
  debug?: Partial<UIDebugState>;
  search?: Partial<UISearchState>;
  tutor?: Partial<UITutorState>;
  plan?: Partial<UIPlanState>;
};
