// Module: store/notices
// Responsibility: Centralize user-facing notice messages used across slices and services.

export const NOTICE_CATALOG = {
  missingClientKey: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY',
  missingAnthropicKey: 'Missing NEXT_PUBLIC_ANTHROPIC_API_KEY',
  noProviderKey: 'Add an API key for at least one provider (OpenRouter, Anthropic, etc.)',
  invalidKey: 'Invalid API key',
  rateLimited: 'Rate limited. Retry later.',
  missingBraveKey: 'Missing BRAVE_SEARCH_API_KEY',
  modelsUnavailable: 'Unable to load models for any provider.',
  exportedChats: 'Exported chats to JSON',
  importedData: 'Imported data',
  planApplyFailed: 'Failed to apply learning plan. Please try again.',
  deepResearchRequiresOpenRouter: 'DeepResearch currently requires an OpenRouter model selection.',
} as const;

export type NoticeId = keyof typeof NOTICE_CATALOG;

export function resolveNotice(notice?: NoticeId | string): string | undefined {
  if (!notice) return undefined;
  return NOTICE_CATALOG[notice as NoticeId] ?? notice;
}

export const NOTICE_MISSING_CLIENT_KEY = NOTICE_CATALOG.missingClientKey;
export const NOTICE_MISSING_ANTHROPIC_KEY = NOTICE_CATALOG.missingAnthropicKey;
export const NOTICE_NO_PROVIDER_KEY = NOTICE_CATALOG.noProviderKey;
export const NOTICE_INVALID_KEY = NOTICE_CATALOG.invalidKey;
export const NOTICE_RATE_LIMITED = NOTICE_CATALOG.rateLimited;
export const NOTICE_MISSING_BRAVE_KEY = NOTICE_CATALOG.missingBraveKey;
export const NOTICE_MODELS_UNAVAILABLE = NOTICE_CATALOG.modelsUnavailable;
export const NOTICE_EXPORTED_CHATS = NOTICE_CATALOG.exportedChats;
export const NOTICE_IMPORTED_DATA = NOTICE_CATALOG.importedData;
export const NOTICE_PLAN_APPLY_FAILED = NOTICE_CATALOG.planApplyFailed;
export const NOTICE_DEEP_RESEARCH_REQUIRES_OPENROUTER =
  NOTICE_CATALOG.deepResearchRequiresOpenRouter;
