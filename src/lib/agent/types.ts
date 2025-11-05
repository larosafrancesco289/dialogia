import type {
  Attachment,
  Chat,
  Message,
  ORModel,
  ModelTransport,
  LearnerModel,
  LearningPlan,
  Evidence,
} from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import { ProviderSort } from '@/lib/models/providerSort';
import type { SetState, GetState } from 'zustand';
import type { StoreState, UIState } from '@/lib/store/types';

export type StoreSetter = SetState<StoreState>;
export type StoreGetter = GetState<StoreState>;
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
  models: ORModel[];
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
};

export type TutorToolName =
  | 'ask_student_question'
  | 'create_diagnostic'
  | 'generate_plan'
  | 'update_plan'
  | 'assess_answer'
  | 'update_learner_model'
  | 'get_plan_suggestions'
  | 'quiz_mcq'
  | 'quiz_fill_blank'
  | 'quiz_open_ended'
  | 'flashcards'
  | 'grade_open_response'
  | 'add_to_deck'
  | 'srs_review';

export type ToolName = 'web_search' | TutorToolName;

export type WebSearchArgs = {
  query: string;
  count?: number;
};

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
  searchEnabled: boolean;
  searchProvider: SearchProvider;
  providerSort?: ProviderSort;
  controller: AbortController;
  turn: TurnContext;
};

export type PlanTurnResult = {
  finalSystem: string;
  usedTutorContentTool: boolean;
  hasSearchResults: boolean;
  learnerModel?: LearnerModel;
  planUpdates?: Message['planUpdates'];
  updatedPlan?: LearningPlan;
  learnerModelDebug?: {
    nodeId: string;
    nodeName?: string;
    evidenceType?: Evidence['type'];
    weight?: number;
    oldConfidence?: number;
    newConfidence?: number;
  };
};

export type ComposeTurnArgs = {
  chat: Chat;
  ui: UIState;
  modelIndex: ModelIndex;
  prior: Message[];
  newUser?: {
    content?: string;
    attachments?: Attachment[];
  };
  attachments?: Attachment[];
};

export type TurnComposition = {
  system?: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  plugins?: PluginConfig[];
  providerSort?: ProviderSort;
  hasPdf: boolean;
  shouldPlan: boolean;
  search: {
    enabled: boolean;
    provider: SearchProvider;
  };
  tutor: {
    enabled: boolean;
  };
  consumedTutorNudge?: UIState['nextTutorNudge'];
};

export type StreamFinalOptions = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  messages: ModelMessage[];
  controller: AbortController;
  providerSort?: ProviderSort;
  turn: TurnContext;
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
};

export type ToolExecutionResult = {
  ok: boolean;
  results: SearchResult[];
  error?: string;
  query: string;
};
