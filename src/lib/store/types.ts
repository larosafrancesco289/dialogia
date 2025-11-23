import type {
  Chat,
  ChatSettings,
  Message,
  ORModel,
  Folder,
  LearningPlan,
  TutorResearchMode,
} from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import type { LearnerModelFeedback } from '@/lib/agent/learnerModel';

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

export type UIState = {
  showSettings: boolean;
  isStreaming: boolean;
  notice?: string;
  sidebarCollapsed?: boolean;
  // Debugging
  debugMode?: boolean;
  // Raw request payloads keyed by assistant message id (ephemeral)
  debugByMessageId?: Record<string, { body: string; createdAt: number }>;
  // Models that emit reasoning traces even when no effort was requested
  autoReasoningModelIds?: Record<string, true>;
  tutorDefaultModelId?: string;
  forceTutorMode?: boolean;
  learnerModelDebugByMessageId?: Record<string, any>;
  next?: UINextOverrides;
  // Tutor context fidelity for follow-up turns
  // 'summary' keeps prompts compact; 'full' injects full quiz JSON
  tutorContextMode?: 'summary' | 'full';
  // Privacy preference: only allow/show Zero Data Retention endpoints
  zdrOnly?: boolean;
  // Routing preference: prioritize speed or cost
  routePreference?: 'speed' | 'cost';
  // Experimental feature toggles (global visibility/usage)
  experimentalBrave?: boolean; // show Brave web search and related UI
  experimentalTutor?: boolean; // show Tutor mode UI and enable tutor tools
  enableMultiModelChat?: boolean; // allow selecting and chatting with multiple models simultaneously
  tutorThesisMode?: boolean;
  tutorResearchMode?: TutorResearchMode;
  braveByMessageId?: Record<
    string,
    {
      query: string;
      status: 'loading' | 'done' | 'error';
      results?: { title?: string; url?: string; description?: string }[];
      error?: string;
    }
  >;
  // Tutor tool payloads keyed by assistant message id
  tutorByMessageId?: Record<string, import('@/lib/types').MessageTutor>;
  tutorProfileByChatId?: Record<string, import('@/lib/types').TutorProfile>;
  tutorWelcomeByChatId?: Record<
    string,
    {
      status: 'idle' | 'loading' | 'ready' | 'error';
      message?: string;
      error?: string;
      generatedAt?: number;
    }
  >;
  tutorWelcomePreview?: {
    status: 'idle' | 'loading' | 'ready' | 'error';
    message?: string;
    error?: string;
    generatedAt?: number;
  };
  // Per-chat ephemeral flags (not persisted)
  tutorGreetedByChatId?: Record<string, boolean>;
  tutorToolUsageByChatId?: Record<string, TutorToolUsage>;
  // Learning plan UI state
  planSheetOpen?: boolean;
  planSheetPlanOverride?: LearningPlan | null;
  planGenerationByChatId?: Record<
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

  // tutor
  logTutorResult: (evt: import('@/lib/types').TutorEvent) => Promise<void>;
  loadTutorProfileIntoUI: (chatId?: string) => Promise<void>;
  primeTutorWelcomePreview: () => Promise<string | undefined>;
  prepareTutorWelcomeMessage: (chatId?: string) => Promise<string | undefined>;
  applyLearnerModelFeedbackFromUser: (input: LearnerModelFeedback) => Promise<void>;

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
  | 'showSettings'
  | 'sidebarCollapsed'
  | 'debugMode'
  | 'tutorContextMode'
  | 'tutorThesisMode'
  | 'tutorResearchMode'
  | 'zdrOnly'
  | 'routePreference'
  | 'experimentalBrave'
  | 'experimentalTutor'
  | 'enableMultiModelChat'
  | 'tutorDefaultModelId'
  | 'forceTutorMode'
>;

export type PersistedStoreState = Pick<
  StoreState,
  'selectedChatId' | 'favoriteModelIds' | 'hiddenModelIds'
> & {
  ui: PersistedUIState;
};
