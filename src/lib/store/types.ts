import type { Chat, ChatSettings, Message, ORModel, MessageMetrics, Folder } from '@/lib/types';

export type UIState = {
  showSettings: boolean;
  isStreaming: boolean;
  notice?: string;
  sidebarCollapsed?: boolean;
  nextModel?: string;
  nextSearchWithBrave?: boolean;
  nextReasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  nextReasoningTokens?: number;
  nextSystem?: string;
  nextTemperature?: number;
  nextTopP?: number;
  nextMaxTokens?: number;
  nextShowThinking?: boolean;
  nextShowStats?: boolean;
  // Privacy preference: only allow/show Zero Data Retention endpoints
  zdrOnly?: boolean;
  // Routing preference: prioritize speed or cost
  routePreference?: 'speed' | 'cost';
  braveByMessageId?: Record<
    string,
    {
      query: string;
      status: 'loading' | 'done' | 'error';
      results?: { title?: string; url?: string; description?: string }[];
      error?: string;
    }
  >;
  compare?: {
    isOpen: boolean;
    prompt: string;
    selectedModelIds: string[];
    runs: Record<
      string,
      {
        status: 'idle' | 'running' | 'done' | 'error' | 'aborted';
        content: string;
        reasoning?: string;
        metrics?: MessageMetrics;
        tokensIn?: number;
        tokensOut?: number;
        error?: string;
      }
    >;
  };
};

export type StoreState = {
  chats: Chat[];
  folders: Folder[];
  messages: Record<string, Message[]>;
  selectedChatId?: string;

  models: ORModel[];
  favoriteModelIds: string[];
  hiddenModelIds: string[];
  // Cached ZDR model ids (ephemeral; not persisted)
  zdrModelIds?: string[];
  // Cached ZDR provider ids (ephemeral; not persisted)
  zdrProviderIds?: string[];

  ui: UIState;

  // ephemeral controllers (not persisted)
  _controller?: AbortController;
  _compareControllers?: Record<string, AbortController>;

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

  // compare
  openCompare: () => void;
  closeCompare: () => void;
  setCompare: (partial: Partial<NonNullable<UIState['compare']>>) => void;
  runCompare: (prompt: string, modelIds: string[]) => Promise<void>;
  stopCompare: () => void;

  // models
  loadModels: (opts?: { showErrors?: boolean }) => Promise<void>;
  toggleFavoriteModel: (id: string) => void;
  hideModel: (id: string) => void;
  unhideModel: (id: string) => void;
  resetHiddenModels: () => void;
  removeModelFromDropdown: (id: string) => void;

  // messaging
  sendUserMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  regenerateAssistantMessage: (messageId: string, opts?: { modelId?: string }) => Promise<void>;
  editUserMessage: (
    messageId: string,
    newContent: string,
    opts?: { rerun?: boolean },
  ) => Promise<void>;
  editAssistantMessage: (messageId: string, newContent: string) => Promise<void>;
};
