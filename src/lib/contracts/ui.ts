import type {
  LearnerModel,
  LearnerModelDebugSnapshot,
  LearningPlan,
  Message,
  MessageTutor,
  StudyCondition,
  TutorResearchMode,
} from '@/lib/types';

export type UiFlagsSnapshot = {
  experimentalBrave?: boolean;
  experimentalTutor?: boolean;
  enableMultiModelChat?: boolean;
};

export type UiNextOverrides = {
  modelId?: string;
  search?: { enabled?: boolean; provider?: 'brave' | 'openrouter' };
  deepResearch?: boolean;
  tutorMode?: boolean;
  tutorNudge?: 'more_practice' | 'harder' | 'easier' | 'review_mistakes' | 'new_concept';
  reasoning?: { effort?: 'none' | 'low' | 'medium' | 'high'; tokens?: number };
  system?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  show?: {
    thinking?: boolean;
    stats?: boolean;
    toolCallLog?: boolean;
    debugRawJson?: boolean;
  };
  parallelModels?: string[];
};

export type UiDebugEntry = {
  body: string;
  createdAt: number;
};

export type LearnerModelDebugEntry = {
  before: LearnerModel;
  after: LearnerModel;
  debug?: LearnerModelDebugSnapshot;
  planUpdates?: Message['planUpdates'];
};

export type UiDebugSnapshot = {
  mode?: boolean;
  byMessageId?: Record<string, UiDebugEntry>;
  autoReasoningModelIds?: Record<string, true>;
  learnerModelDebugByMessageId?: Record<string, LearnerModelDebugEntry>;
};

export type UiSearchEntry = {
  query: string;
  status: 'loading' | 'done' | 'error';
  results?: { title?: string; url?: string; description?: string }[];
  error?: string;
};

export type UiSearchSnapshot = {
  braveByMessageId?: Record<string, UiSearchEntry>;
};

export type TutorToolUsageSnapshot = {
  mcqByNode?: Record<string, number>;
  diagnosticsUsed?: number;
  lastMessageId?: string;
  toolsThisTurn?: number;
};

export type UiTutorSnapshot = {
  byMessageId?: Record<string, MessageTutor>;
  toolUsageByChatId?: Record<string, TutorToolUsageSnapshot>;
  defaultModelId?: string;
  forceMode?: boolean;
  researchMode?: TutorResearchMode;
  studyCondition?: StudyCondition;
  autoScroll?: boolean;
};

export type UiPlanSnapshot = {
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

export type UiMobileSnapshot = {
  activeTab: MobileTab;
  chatsSheetOpen: boolean;
  settingsSheetOpen: boolean;
  headerVisible: boolean;
  swipeRevealedMessageId: string | null;
  lastScrollY: number;
  composerFocused: boolean;
};

export type UiSnapshot = {
  showSettings: boolean;
  activeTurnByChatId: Record<string, number>;
  notice?: string;
  overrides?: UiNextOverrides;
  routePreference?: 'speed' | 'cost';
  zdrOnly?: boolean;
  flags: UiFlagsSnapshot;
  debug: UiDebugSnapshot;
  search: UiSearchSnapshot;
  tutor: UiTutorSnapshot;
  plan: UiPlanSnapshot;
  mobile: UiMobileSnapshot;
};
