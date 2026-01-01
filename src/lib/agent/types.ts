import type {
  Chat,
  Message,
  ModelDescriptor,
  ModelTransport,
  LearnerModel,
  LearningPlan,
  LearnerModelDebugSnapshot,
  PersistedAttachment,
} from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import { ProviderSort } from '@/lib/models/providerSort';
import type { AccessTier } from '@/lib/auth/types';
import type { TurnStoreState } from '@/lib/agent/contracts';
import type {
  StoreGetter as ContractStoreGetter,
  StoreSetter as ContractStoreSetter,
} from '@/lib/contracts/store';
import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';
import type { ResolvedTurnSettings } from '@/lib/settings/resolve';
import type { WebSearchToolArgs } from '@/lib/tools/webSearch';

export type StoreSetter = ContractStoreSetter<TurnStoreState>;
export type StoreGetter = ContractStoreGetter<TurnStoreState>;
export type PersistMessage = (message: Message) => Promise<void>;

export type ModelContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } };

export type SystemModelMessage = {
  role: 'system';
  content: string;
};

export type UserModelMessage = {
  role: 'user';
  content: string | ModelContentBlock[];
  name?: string;
};

export type AssistantModelMessage = {
  role: 'assistant';
  content: string | ModelContentBlock[] | null;
  name?: string;
  annotations?: unknown;
  tool_calls?: ToolCall[];
  // reasoning_details is required by Gemini, Claude, and other reasoning models
  // when preserving thought signatures across tool call roundtrips
  reasoning_details?: unknown;
};

export type ToolModelMessage = {
  role: 'tool';
  content: string;
  tool_call_id: string;
  name?: string;
};

export type ModelMessage =
  | SystemModelMessage
  | UserModelMessage
  | AssistantModelMessage
  | ToolModelMessage;

export { ProviderSort };
export type { ResolvedTurnSettings };

export type PdfPluginConfig = {
  id: 'file-parser';
  pdf: { engine: 'pdf-text' };
};

export type WebPluginConfig = {
  id: 'web';
};

export type PluginConfig = PdfPluginConfig | WebPluginConfig;

export type SearchProvider = 'brave' | 'openrouter';

export type ToolFunctionDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type ToolDefinition = {
  type: 'function';
  function: ToolFunctionDefinition;
};

export type StoreAccess = { set: StoreSetter; get: StoreGetter };

export type TurnContext = {
  apiKey: string;
  transport: ModelTransport;
  set: StoreSetter;
  get: StoreGetter;
  models: ModelDescriptor[];
  modelIndex: ModelIndex;
  persistMessage: PersistMessage;
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  // Allow provider-specific extra fields (e.g., Gemini's thought_signature)
  [key: string]: unknown;
};

export const TUTOR_TOOL_NAMES = [
  'ask_student_question',
  'create_diagnostic',
  'generate_plan',
  'update_plan',
  'assess_answer',
  'update_learner_model',
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
};

export type ToolExecutionResult = {
  ok: boolean;
  results: SearchResult[];
  error?: string;
  query: string;
};
