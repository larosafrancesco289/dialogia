// Module: agent/generation
// Responsibility: Provide helpers for capturing per-turn generation settings snapshots.

import { isReasoningSupported } from '@/lib/models';
import type { ChatSettings, ORModel } from '@/lib/types';
import type { ProviderSort } from '@/lib/agent/request';

export function snapshotGenSettings(opts: {
  settings: ChatSettings;
  modelMeta: ORModel | undefined;
  searchProvider: 'brave' | 'openrouter';
  providerSort: ProviderSort;
}) {
  const { settings, modelMeta, searchProvider, providerSort } = opts;
  const supportsReasoning = isReasoningSupported(modelMeta);
  return {
    temperature: settings.temperature,
    top_p: settings.top_p,
    max_tokens: settings.max_tokens,
    reasoning_effort: supportsReasoning ? settings.reasoning_effort : undefined,
    reasoning_tokens: supportsReasoning ? settings.reasoning_tokens : undefined,
    search_with_brave: !!settings.search_with_brave,
    search_provider: searchProvider,
    tutor_mode: !!settings.tutor_mode,
    providerSort,
  } as Record<string, unknown>;
}
