import type { Chat, Message, ModelDescriptor, PersistedAttachment, SearchMode } from '@/lib/types';
import type { SearchResult } from '@/lib/search/types';
import type { Result } from '@/lib/utils/result';
import type { ModelIndex } from '@/lib/models';
import type { TransportAuth } from '@/lib/auth/transport';
import type { TurnStore, TurnStoreState } from '@/lib/agent/contracts';
import type {
  StoreGetter as ContractStoreGetter,
  StoreSetter as ContractStoreSetter,
} from '@/lib/contracts/store';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type { ResolvedTurnSettings } from '@/lib/settings/resolve';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';

export type {
  ModelContentBlock,
  ModelMessage,
  PluginConfig,
  ToolCall,
  ToolDefinition,
  ToolModelMessage,
} from '@/lib/transport/contracts';

export type StoreSetter = ContractStoreSetter<TurnStoreState>;
export type StoreGetter = ContractStoreGetter<TurnStoreState>;
export type PersistMessage = (message: Message) => Promise<void>;

export type { ResolvedTurnSettings };

export type StoreAccess = { set: StoreSetter; get: StoreGetter };

export type { SearchMode };

export type TurnContext = {
  auth: TransportAuth;
  set: StoreSetter;
  get: StoreGetter;
  models: ModelDescriptor[];
  modelIndex: ModelIndex;
  persistMessage: PersistMessage;
};

export type PlanTurnResult = {
  finalSystem: string;
  usedContentTool: boolean;
  hasSearchResults: boolean;
};

export type PlanTurnSideEffect = {
  type: 'append_planning_content';
  chatId: string;
  messageId: string;
  content: string;
};

export type ComposeTurnArgs = {
  chat: Chat;
  ui: UiSnapshot;
  settings: ResolvedTurnSettings;
  modelIndex: ModelIndex;
  prior: Message[];
  newUser?: {
    content?: string;
    attachments?: PersistedAttachment[];
  };
  attachments?: PersistedAttachment[];
  /** The turn's store, for modules that read their own state while composing. */
  store?: TurnStore;
};

/**
 * How a turn with tools runs. 'default' drafts, runs tools silently, then
 * streams a closing answer (search). 'agent' streams every round visibly into
 * the one reply and runs until the model stops calling tools, a tool ends the
 * turn, or the round cap is reached.
 */
export type TurnLoopMode = 'default' | 'agent';

export type TurnComposition = {
  system?: string;
  /** Stable portion of the system prompt (cacheable across turns). */
  systemStable?: string;
  /** Dynamic portion of the system prompt (changes per turn, e.g. mastery scores). */
  systemDynamic?: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  /**
   * The turn's tools read again, for the agent loop to offer between rounds.
   * Set only when a module can refresh its tools.
   */
  refreshTools?: () => ToolDefinition[];
  plugins?: PluginConfig[];
  hasPdf: boolean;
  /** Tool-based search is on: the turn drafts, runs the search tools, then answers. */
  shouldPlan: boolean;
  /** Set when an enabled module asked for the agent loop. */
  loop?: TurnLoopMode;
  settings: ResolvedTurnSettings;
  /** Fields the modules want on this turn's assistant message; applied when composed. */
  messagePatch?: Partial<Message>;
};

export type StreamFinalOptions = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  messages: ModelMessage[];
  controller: AbortController;
  turn: TurnContext;
  settings: ResolvedTurnSettings;
  plugins?: PluginConfig[];
  toolDefinition?: ToolDefinition[];
  pipeline?: PipelineClient;
  systemStable?: string;
  systemDynamic?: string;
};

export type RegenerateOptions = {
  chat: Chat;
  chatId: string;
  targetMessageId: string;
  messages: Message[];
  turn: TurnContext;
  controller: AbortController;
  overrideModelId?: string;
  pipeline?: PipelineClient;
};

export type ToolExecutionResult = Result<
  {
    results: SearchResult[];
    query: string;
  },
  string | undefined
>;
