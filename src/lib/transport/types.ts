import type { Usage } from '@/lib/api/normalizers';
import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';
import type { ProviderSort } from '@/lib/models/providerSort';
import type { ChatCompletion } from '@/lib/transport/completions';
import type { ModelDescriptor } from '@/lib/transport/models';

export type StreamDoneExtras = {
  usage?: Usage;
  annotations?: unknown;
};

export type StreamCallbacks = {
  onStart?: () => void;
  onToken?: (delta: string) => void;
  onReasoningToken?: (delta: string) => void;
  onImage?: (dataUrl: string) => void;
  onAnnotations?: (annotations: unknown) => void;
  onDone?: (full: string, extras?: StreamDoneExtras) => void;
  onError?: (err: Error) => void;
};

export type TransportChatParams = {
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
  signal?: AbortSignal;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  origin?: string;
};

export type TransportStreamParams = TransportChatParams & { callbacks?: StreamCallbacks };

export type TransportFetchModelsOptions = {
  origin?: string;
  signal?: AbortSignal;
};

export type TransportClient = {
  fetchModels: (apiKey: string, opts?: TransportFetchModelsOptions) => Promise<ModelDescriptor[]>;
  chatCompletion: (params: TransportChatParams) => Promise<ChatCompletion>;
  streamChatCompletion: (params: TransportStreamParams) => Promise<void>;
};
