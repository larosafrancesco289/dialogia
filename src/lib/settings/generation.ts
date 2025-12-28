import type { ProviderSort } from '@/lib/models/providerSort';
import type { ChatSettings } from '@/lib/types';

export type GenerationSettings = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  reasoningTokens?: number;
  searchEnabled?: boolean;
  searchProvider?: 'brave' | 'openrouter';
  tutorMode?: boolean;
  providerSort?: ProviderSort;
};

export function chatSettingsToGenerationSettings(
  settings: ChatSettings,
  opts: { supportsReasoning?: boolean } = {},
): GenerationSettings {
  const supportsReasoning = opts.supportsReasoning ?? true;
  return {
    temperature: settings.temperature,
    topP: settings.top_p,
    maxTokens: settings.max_tokens,
    reasoningEffort: supportsReasoning ? settings.reasoning_effort : undefined,
    reasoningTokens: supportsReasoning ? settings.reasoning_tokens : undefined,
    searchEnabled: settings.search_enabled,
    searchProvider: settings.search_provider,
    tutorMode: settings.tutor_mode,
  };
}

export function generationSettingsToOpenRouterParams(settings: GenerationSettings): {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  providerSort?: ProviderSort;
} {
  return {
    temperature: settings.temperature,
    top_p: settings.topP,
    max_tokens: settings.maxTokens,
    reasoning_effort: settings.reasoningEffort,
    reasoning_tokens: settings.reasoningTokens,
    providerSort: settings.providerSort,
  };
}
