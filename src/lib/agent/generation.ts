// Module: agent/generation
// Responsibility: Provide helpers for capturing per-turn generation settings snapshots.

import type { GenSettingsSnapshot } from '@/lib/types';
import type { ResolvedTurnSettings } from '@/lib/agent/types';

export function snapshotGenSettings(settings: ResolvedTurnSettings): GenSettingsSnapshot {
  const generation = settings.generation;
  const snapshot: GenSettingsSnapshot = {
    temperature: generation.temperature,
    top_p: generation.topP,
    max_tokens: generation.maxTokens,
    reasoning_effort: generation.reasoningEffort,
    reasoning_tokens: generation.reasoningTokens,
    search_enabled: !!generation.searchEnabled,
    search_provider: generation.searchProvider,
    tutor_mode: !!generation.tutorMode,
  };
  if (generation.providerSort) snapshot.providerSort = generation.providerSort;
  return snapshot;
}
