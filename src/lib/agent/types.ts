import type {
  Chat,
  Message,
  ModelDescriptor,
  LearnerModel,
  LearningPlan,
  LearnerModelDebugSnapshot,
  PersistedAttachment,
  SearchProvider,
} from '@/lib/types';
import type { SearchResult } from '@/lib/search/types';
import type { Result } from '@/lib/utils/result';
import type { ModelIndex } from '@/lib/models';
import { ProviderSort } from '@/lib/models/providerSort';
import type { TransportAuth } from '@/lib/auth/transport';
import type { TurnStoreState } from '@/lib/agent/contracts';
import type {
  StoreGetter as ContractStoreGetter,
  StoreSetter as ContractStoreSetter,
} from '@/lib/contracts/store';
import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';
import type { ResolvedTurnSettings } from '@/lib/settings/resolve';
import type { WebSearchArgs as SearchArgs } from '@/lib/search/args';
import type { ToolName, TutorToolName } from '@/lib/tools/registry';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';

export type {
  AssistantModelMessage,
  CacheControl,
  ModelContentBlock,
  ModelMessage,
  PdfPluginConfig,
  PluginConfig,
  SystemModelMessage,
  ToolCall,
  ToolDefinition,
  ToolFunctionDefinition,
  ToolModelMessage,
  UserModelMessage,
  WebPluginConfig,
} from '@/lib/transport/contracts';

export type StoreSetter = ContractStoreSetter<TurnStoreState>;
export type StoreGetter = ContractStoreGetter<TurnStoreState>;
export type PersistMessage = (message: Message) => Promise<void>;

export { ProviderSort };
export type { ResolvedTurnSettings };

export type StoreAccess = { set: StoreSetter; get: StoreGetter };

export type { SearchProvider };

export type TurnContext = {
  auth: TransportAuth;
  set: StoreSetter;
  get: StoreGetter;
  models: ModelDescriptor[];
  modelIndex: ModelIndex;
  persistMessage: PersistMessage;
};

export type { ToolName, TutorToolName };

export type WebSearchArgs = SearchArgs;

export type TutorToolCall = {
  name: TutorToolName;
  args: Record<string, unknown>;
};

export type PlanTurnOptions = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  userContent: string;
  combinedSystem?: string;
  systemStable?: string;
  systemDynamic?: string;
  baseMessages: ModelMessage[];
  toolDefinition?: ToolDefinition[];
  controller: AbortController;
  turn: TurnContext;
  settings: ResolvedTurnSettings;
  pipeline?: PipelineClient;
};

export type PlanTurnResult = {
  finalSystem: string;
  usedTutorContentTool: boolean;
  hasSearchResults: boolean;
  learnerModel?: LearnerModel;
  planUpdates?: Message['planUpdates'];
  updatedPlan?: LearningPlan;
  learnerModelDebug?: LearnerModelDebugSnapshot;
};

export type PlanTurnSideEffect = {
  type: 'append_planning_content';
  chatId: string;
  messageId: string;
  content: string;
};

export type PlanTurnOutput = {
  result: PlanTurnResult;
  sideEffects: PlanTurnSideEffect[];
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
};

export type TurnComposition = {
  system?: string;
  /** Stable portion of the system prompt (cacheable across turns). */
  systemStable?: string;
  /** Dynamic portion of the system prompt (changes per turn, e.g. mastery scores). */
  systemDynamic?: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  plugins?: PluginConfig[];
  hasPdf: boolean;
  shouldPlan: boolean;
  settings: ResolvedTurnSettings;
  consumedTutorNudge?: UiNextOverrides['tutorNudge'];
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
  startBuffered: boolean;
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
