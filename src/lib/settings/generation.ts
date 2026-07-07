import type { ChatSettings, GenerationSettings, ReasoningEffort } from '@/lib/types';

export type { GenerationSettings };

// Standard effort applied when a reasoning-capable model has no explicit
// setting; new chats start here instead of with reasoning disabled.
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';

/**
 * Returns true if the user has explicitly requested reasoning via effort or token budget.
 */
export function isReasoningRequested(generation: GenerationSettings): boolean {
  const effort = generation.reasoningEffort;
  if (effort === 'none') return false;
  const effortRequested = typeof effort === 'string';
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
