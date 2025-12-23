import type {
  Chat,
  ChatSettings,
  Message,
  ORModel,
  Folder,
  LearningPlan,
  TutorResearchMode,
  LearnerModel,
  LearnerModelDebugSnapshot,
} from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import type { LearnerModelFeedback } from '@/lib/agent/learnerModel';
import type { VoiceState, VoiceActions } from '@/lib/voice/types';

export type TutorToolUsage = {
  mcqByNode?: Record<string, number>;
  diagnosticsUsed?: number;
  lastMessageId?: string;
  toolsThisTurn?: number;
};

export type UINextOverrides = {
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

export type LearnerModelDebugEntry = {
  before: LearnerModel;
  after: LearnerModel;
  debug?: LearnerModelDebugSnapshot;
  planUpdates?: Message['planUpdates'];
};

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
  byMessageId?: Record<string, import('@/lib/types').MessageTutor>;
  profileByChatId?: Record<string, import('@/lib/types').TutorProfile>;
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

export type UIState = {
  showSettings: boolean;
  isStreaming: boolean;
  notice?: string;
  sidebarCollapsed?: boolean;
  overrides?: UINextOverrides;
  // Privacy preference: only allow/show Zero Data Retention endpoints
  zdrOnly?: boolean;
  // Routing preference: prioritize speed or cost
  routePreference?: 'speed' | 'cost';
  flags: UIFlags;
  debug: UIDebugState;
  search: UISearchState;
  tutor: UITutorState;
  plan: UIPlanState;
};

export type StoreState = {
  chats: Chat[];
  folders: Folder[];
  messages: Record<string, Message[]>;
  selectedChatId?: string;

  models: ORModel[];
  modelIndex: ModelIndex;
  favoriteModelIds: string[];
  hiddenModelIds: string[];
  // Cached ZDR model ids (ephemeral; not persisted)
  zdrModelIds?: string[];
  // Cached ZDR provider ids (ephemeral; not persisted)
  zdrProviderIds?: string[];
  // Timestamp when ZDR lists were last fetched
  zdrFetchedAt?: number;

  ui: UIState;

  // Voice agent state
  voice: VoiceState;
} & VoiceActions & {
    // lifecycle
    initializeApp: () => Promise<void>;

    // chats
    newChat: () => Promise<void>;
    selectChat: (id: string) => void;
    renameChat: (id: string, title: string) => Promise<void>;
    deleteChat: (id: string) => Promise<void>;
    updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>;
    moveChatToFolder: (chatId: string, folderId?: string) => Promise<void>;

    // folders
    createFolder: (name: string, parentId?: string) => Promise<void>;
    renameFolder: (id: string, name: string) => Promise<void>;
    deleteFolder: (id: string) => Promise<void>;
    toggleFolderExpanded: (id: string) => Promise<void>;

    // ui
    setUI: (partial: Partial<UIState>) => void;
    setSearchStatus: (
      messageId: string,
      entry: NonNullable<UISearchState['braveByMessageId']>[string],
    ) => void;

    // tutor
    logTutorResult: (evt: import('@/lib/types').TutorEvent) => Promise<void>;
    loadTutorProfileIntoUI: (chatId?: string) => Promise<void>;
    primeTutorWelcomePreview: () => Promise<string | undefined>;
    prepareTutorWelcomeMessage: (chatId?: string) => Promise<string | undefined>;
    applyLearnerModelFeedbackFromUser: (input: LearnerModelFeedback) => Promise<void>;
    patchTutorEntry: (
      messageId: string,
      patch: Partial<import('@/lib/types').MessageTutor>,
      opts?: { persist?: boolean },
    ) => Promise<void>;
    setTutorAttemptMcq: (
      messageId: string,
      itemId: string,
      choiceIdx: number,
      correct: boolean,
    ) => void;
    setTutorAttemptFillBlank: (
      messageId: string,
      itemId: string,
      answer: string,
      revealed?: boolean,
      correct?: boolean,
    ) => void;
    setTutorAttemptOpen: (messageId: string, itemId: string, answer: string) => void;
    setTutorPlanProposalStatus: (
      messageId: string,
      status: 'pending' | 'approved' | 'declined',
    ) => void;

    // models
    loadModels: (opts?: { showErrors?: boolean }) => Promise<void>;
    toggleFavoriteModel: (id: string) => void;
    hideModel: (id: string) => void;
    unhideModel: (id: string) => void;
    resetHiddenModels: () => void;
    removeModelFromDropdown: (id: string) => void;

    // messaging
    sendUserMessage: (
      content: string,
      opts?: {
        attachments?: import('@/lib/types').Attachment[];
        metadata?: Message['metadata'];
      },
    ) => Promise<void>;
    // chat branching
    branchChatFromMessage: (messageId: string) => Promise<void>;
    stopStreaming: () => void;
    regenerateAssistantMessage: (messageId: string, opts?: { modelId?: string }) => Promise<void>;
    editUserMessage: (
      messageId: string,
      newContent: string,
      opts?: { rerun?: boolean },
    ) => Promise<void>;
    editAssistantMessage: (messageId: string, newContent: string) => Promise<void>;
    // utility for UI features (e.g., multi-model responses inserting a result)
    appendAssistantMessage: (content: string, opts?: { modelId?: string }) => Promise<void>;
    // tutor persistence
    persistTutorStateForMessage: (messageId: string) => Promise<void>;
  };

export type PersistedUIState = Pick<
  UIState,
  'showSettings' | 'sidebarCollapsed' | 'zdrOnly' | 'routePreference'
> & {
  flags?: Pick<UIFlags, 'experimentalBrave' | 'experimentalTutor' | 'enableMultiModelChat'>;
  debug?: Pick<UIDebugState, 'mode'>;
  tutor?: Pick<
    UITutorState,
    'contextMode' | 'thesisMode' | 'researchMode' | 'defaultModelId' | 'forceMode'
  >;
};

export type PersistedStoreState = Pick<
  StoreState,
  'selectedChatId' | 'favoriteModelIds' | 'hiddenModelIds'
> & {
  ui: PersistedUIState;
};
