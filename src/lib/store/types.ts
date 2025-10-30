import type { Chat, ChatSettings, Message, ORModel, MessageMetrics, Folder } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';

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
  tutorMemoryModelId?: string;
  tutorMemoryFrequency?: number;
  tutorMemoryAutoUpdate?: boolean;
  tutorGlobalMemory?: string;
  forceTutorMode?: boolean;
  tutorMemoryDebugByMessageId?: Record<
    string,
    {
      version?: number;
      messageCount?: number;
      updatedAt?: number;
      model?: string;
      before?: string;
      after?: string;
      raw?: string;
      conversationWindow?: string;
    }
  >;
  learnerModelDebugByMessageId?: Record<string, any>;
  nextModel?: string;
  nextSearchEnabled?: boolean;
  nextSearchProvider?: 'brave' | 'openrouter';
  // Toggle DeepResearch for the next send from composer
  nextDeepResearch?: boolean;
  // If no chat is open yet, allow toggling tutor mode for the next chat
  nextTutorMode?: boolean;
  // Tutor steering: set before next turn to bias planning
  nextTutorNudge?: 'more_practice' | 'harder' | 'easier' | 'review_mistakes' | 'new_concept';
  nextReasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  nextReasoningTokens?: number;
  nextSystem?: string;
  nextTemperature?: number;
  nextTopP?: number;
  nextMaxTokens?: number;
  nextShowThinking?: boolean;
  nextShowStats?: boolean;
  nextParallelModels?: string[];
  // Tutor context fidelity for follow-up turns
  // 'summary' keeps prompts compact; 'full' injects full quiz JSON
  tutorContextMode?: 'summary' | 'full';
  // Privacy preference: only allow/show Zero Data Retention endpoints
  zdrOnly?: boolean;
  // Routing preference: prioritize speed or cost
  routePreference?: 'speed' | 'cost';
  // Experimental feature toggles (global visibility/usage)
  experimentalBrave?: boolean; // show Brave web search and related UI
  experimentalDeepResearch?: boolean; // show DeepResearch toggle and enable API path
  experimentalTutor?: boolean; // show Tutor mode UI and enable tutor tools
  enableMultiModelChat?: boolean; // allow selecting and chatting with multiple models simultaneously
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
  tutorByMessageId?: Record<
    string,
    {
      title?: string;
      mcq?: import('@/lib/types').TutorMCQItem[];
      fillBlank?: import('@/lib/types').TutorFillBlankItem[];
      openEnded?: import('@/lib/types').TutorOpenItem[];
      flashcards?: import('@/lib/types').TutorFlashcardItem[];
      // Session and planning metadata
      session?: {
        goal?: string;
        duration_min?: number;
        stage?: 'baseline' | 'teach' | 'practice' | 'reflect' | 'review';
        focus?: string;
        next?: string;
        skills?: string[];
      };
      recommendation?: {
        reason?: string;
        recommendation?: 'more_practice' | 'harder' | 'easier' | 'review_mistakes' | 'new_concept';
      };
      // User attempts (stateful, per assistant message)
      attempts?: {
        mcq?: Record<string, { choice?: number; done?: boolean; correct?: boolean }>;
        fillBlank?: Record<string, { answer?: string; revealed?: boolean; correct?: boolean }>;
        open?: Record<string, { answer?: string }>;
      };
      // Grading results keyed by item id
      grading?: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
    }
  >;
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
    opts?: { attachments?: import('@/lib/types').Attachment[] },
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
  | 'zdrOnly'
  | 'routePreference'
  | 'experimentalBrave'
  | 'experimentalDeepResearch'
  | 'experimentalTutor'
  | 'enableMultiModelChat'
  | 'tutorDefaultModelId'
  | 'tutorMemoryModelId'
  | 'tutorMemoryFrequency'
  | 'tutorMemoryAutoUpdate'
  | 'tutorGlobalMemory'
  | 'forceTutorMode'
>;

export type PersistedStoreState = Pick<
  StoreState,
  'selectedChatId' | 'favoriteModelIds' | 'hiddenModelIds'
> & {
  ui: PersistedUIState;
};
