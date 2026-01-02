// Module: agent/generation
// Responsibility: Provide helpers for capturing per-turn generation settings snapshots.

import type { GenSettingsSnapshot } from '@/lib/types';
import type { ResolvedTurnSettings } from '@/lib/agent/types';

export function snapshotGenSettings(settings: ResolvedTurnSettings): GenSettingsSnapshot {
  const generation = settings.generation;
  const snapshot: GenSettingsSnapshot = {
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    searchEnabled: settings.searchEnabled,
    searchProvider: settings.searchProvider,
    tutorEnabled: settings.tutorEnabled,
  };
  if (generation.providerSort) snapshot.providerSort = generation.providerSort;
  return snapshot;
}
