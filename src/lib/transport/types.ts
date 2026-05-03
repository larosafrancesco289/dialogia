import type { Usage } from '@/lib/api/normalizers';
import type {
  ModelMessage,
  PluginConfig,
  ToolDefinition,
  ToolCall,
} from '@/lib/transport/contracts';
import type { ProviderSort } from '@/lib/models/providerSort';
import type { ChatCompletion } from '@/lib/transport/completions';
import type { ModelDescriptor } from '@/lib/transport/models';
import type { TransportAuth } from '@/lib/auth/transport';
import type { ReasoningEffort } from '@/lib/types/enums';

export type ToolCallDelta = {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter';

export type StreamDoneExtras = {
  usage?: Usage;
  annotations?: unknown;
  finishReason?: FinishReason;
  toolCalls?: ToolCall[];
  reasoningDetails?: unknown;
};

export type StreamCallbacks = {
  onStart?: () => void;
  onToken?: (delta: string) => void;
  onReasoningToken?: (delta: string) => void;
  onImage?: (dataUrl: string) => void;
  onAnnotations?: (annotations: unknown) => void;
  onToolCallDelta?: (deltas: ToolCallDelta[]) => void;
  onDone?: (full: string, extras?: StreamDoneExtras) => void;
  onError?: (err: Error) => void;
};

export type TransportChatParams = {
  auth: TransportAuth;
  model: string;
  messages: ModelMessage[];
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  reasoningTokens?: number;
  disableReasoning?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallelToolCalls?: boolean;
  signal?: AbortSignal;
  providerSort?: ProviderSort;
  zdrOnly?: boolean;
  plugins?: PluginConfig[];
  origin?: string;
};

export type TransportStreamParams = TransportChatParams & { callbacks?: StreamCallbacks };

export type TransportFetchModelsOptions = {
  origin?: string;
  signal?: AbortSignal;
};

export type TransportClient = {
  fetchModels: (
    auth: TransportAuth,
    opts?: TransportFetchModelsOptions,
  ) => Promise<ModelDescriptor[]>;
  chatCompletion: (params: TransportChatParams) => Promise<ChatCompletion>;
  streamChatCompletion: (params: TransportStreamParams) => Promise<void>;
};
