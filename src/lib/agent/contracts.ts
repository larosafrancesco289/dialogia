import type {
  Chat,
  LearnerModel,
  LearnerModelDebugSnapshot,
  LearningPlan,
  Message,
  MessageTutor,
  ORModel,
  TutorResearchMode,
} from '@/lib/types';
import type { ModelIndex } from '@/lib/models';

export type UiFlagsSnapshot = {
  experimentalBrave?: boolean;
  experimentalTutor?: boolean;
  enableMultiModelChat?: boolean;
};

export type UiNextOverrides = {
  model?: string;
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
  thesisMode?: boolean;
  researchMode?: TutorResearchMode;
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
  isStreaming: boolean;
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

export type TurnStoreState = {
  chats: Chat[];
  messages: Record<string, Message[]>;
  models: ORModel[];
  modelIndex: ModelIndex;
  selectedChatId?: string;
  ui: UiSnapshot;
  // Cached ZDR model ids (ephemeral; not persisted)
  zdrModelIds?: string[];
  // Cached ZDR provider ids (ephemeral; not persisted)
  zdrProviderIds?: string[];
  // Timestamp when ZDR lists were last fetched
  zdrFetchedAt?: number;
  renameChat: (id: string, title: string) => Promise<void>;
  prepareTutorWelcomeMessage?: (chatId?: string) => Promise<string | undefined>;
  setSearchStatus: (messageId: string, entry: UiSearchEntry) => void;
};

export type StoreSetter<T> = (
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace?: boolean,
) => void;

export type StoreGetter<T> = () => T;

export type TurnStore = {
  set: StoreSetter<TurnStoreState>;
  get: StoreGetter<TurnStoreState>;
};
