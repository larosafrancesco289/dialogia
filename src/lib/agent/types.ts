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
import type { ModelIndex } from '@/lib/models';
import { ProviderSort } from '@/lib/models/providerSort';
import type { AccessTier } from '@/lib/auth/types';
import type { TransportAuth } from '@/lib/auth/transport';
import type { TurnStoreState } from '@/lib/agent/contracts';
import type {
  StoreGetter as ContractStoreGetter,
  StoreSetter as ContractStoreSetter,
} from '@/lib/contracts/store';
import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';
import type { ResolvedTurnSettings } from '@/lib/settings/resolve';
import type { WebSearchToolArgs } from '@/lib/tools/definitions';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';

export type {
  AssistantModelMessage,
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

export const TUTOR_TOOL_NAMES = [
  'ask_student_question',
  'create_diagnostic',
  'generate_plan',
  'update_plan',
  'assess_answer',
  'update_learner_model',
  'advance_topic',
  'apply_learner_model_feedback',
  'get_plan_suggestions',
  'quiz_mcq',
  'quiz_fill_blank',
  'quiz_open_ended',
  'flashcards',
  'grade_open_response',
  'add_to_deck',
  'srs_review',
] as const;

export type TutorToolName = (typeof TUTOR_TOOL_NAMES)[number];

export const TOOL_NAMES = ['web_search', ...TUTOR_TOOL_NAMES] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type WebSearchArgs = WebSearchToolArgs;

export type TutorToolCall = {
  name: TutorToolName;
  args: Record<string, unknown>;
};

export type SearchResult = {
  title?: string;
  url?: string;
  description?: string;
};

export type PlanTurnOptions = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  userContent: string;
  combinedSystem?: string;
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
};

export type RegenerateOptions = {
  chat: Chat;
  chatId: string;
  targetMessageId: string;
  messages: Message[];
  turn: TurnContext;
  controller: AbortController;
  overrideModelId?: string;
  tier: AccessTier;
  pipeline?: PipelineClient;
};

export type ToolExecutionResult = {
  ok: boolean;
  results: SearchResult[];
  error?: string;
  query: string;
};
