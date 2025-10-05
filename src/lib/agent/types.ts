import type { Chat, Message, ORModel } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import type { ProviderSort } from '@/lib/agent/request';
import type { SetState, GetState } from 'zustand';
import type { StoreState } from '@/lib/store/types';

export type StoreSetter = SetState<StoreState>;
export type StoreGetter = GetState<StoreState>;
export type PersistMessage = (message: Message) => Promise<void>;

export type ModelMessage = Record<string, unknown>;

export type PluginConfig = Record<string, unknown>;

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

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type TutorToolName =
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
  providerSort: ProviderSort;
  apiKey: string;
  controller: AbortController;
  set: StoreSetter;
  get: StoreGetter;
  models: ORModel[];
  modelIndex: ModelIndex;
  persistMessage: PersistMessage;
};

export type PlanTurnResult = {
  finalSystem: string;
  usedTutorContentTool: boolean;
  hasSearchResults: boolean;
};

export type StreamFinalOptions = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  messages: ModelMessage[];
  controller: AbortController;
  apiKey: string;
  providerSort: ProviderSort;
  set: StoreSetter;
  get: StoreGetter;
  models: ORModel[];
  modelIndex: ModelIndex;
  persistMessage: PersistMessage;
  plugins?: PluginConfig[];
  toolDefinition?: ToolDefinition[];
  startBuffered: boolean;
};

export type RegenerateOptions = {
  chat: Chat;
  chatId: string;
  targetMessageId: string;
  messages: Message[];
  models: ORModel[];
  modelIndex: ModelIndex;
  apiKey: string;
  controller: AbortController;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: PersistMessage;
  overrideModelId?: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  results: SearchResult[];
  error?: string;
  query: string;
};
