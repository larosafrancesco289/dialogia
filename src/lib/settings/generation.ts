import type { ChatSettings, GenerationSettings } from '@/lib/types';

export type { GenerationSettings };

export function chatSettingsToGenerationSettings(
  settings: ChatSettings,
  opts: { supportsReasoning?: boolean } = {},
): GenerationSettings {
  const supportsReasoning = opts.supportsReasoning ?? true;
  const generation = settings.generation;
  return {
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: supportsReasoning ? generation.reasoningEffort : undefined,
    reasoningTokens: supportsReasoning ? generation.reasoningTokens : undefined,
    providerSort: generation.providerSort,
  };
}
