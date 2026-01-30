import type { ChatSettings, GenerationSettings } from '@/lib/types';

export type { GenerationSettings };

/**
 * Returns true if the user has explicitly requested reasoning via effort or token budget.
 */
export function isReasoningRequested(generation: GenerationSettings): boolean {
  const effortRequested =
    typeof generation.reasoningEffort === 'string' && generation.reasoningEffort !== 'none';
  const tokensRequested =
    typeof generation.reasoningTokens === 'number' && generation.reasoningTokens > 0;
  return effortRequested || tokensRequested;
}

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
