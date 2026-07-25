// Module: store/notices
// Responsibility: Centralize user-facing notice messages used across slices and services.

export const NOTICE_CATALOG = {
  missingClientKey: 'Missing provider API key or proxy configuration',
  missingAnthropicKey: 'Missing VITE_ANTHROPIC_API_KEY',
  invalidKey: 'Invalid API key',
  rateLimited: 'Rate limited. Retry later.',
  missingTavilyKey: 'Missing TAVILY_API_KEY',
  modelsUnavailable: 'Unable to load models.',
  exportedChats: 'Exported chats to JSON',
  importedData: 'Imported data',
  planApplyFailed: 'Failed to apply learning plan. Please try again.',
} as const;

export type NoticeId = keyof typeof NOTICE_CATALOG;

export function resolveNotice(notice?: NoticeId | string): string | undefined {
  if (!notice) return undefined;
  return NOTICE_CATALOG[notice as NoticeId] ?? notice;
}

/** Notices that confirm an action rather than report a problem. */
const SUCCESS_NOTICES = new Set<string>([
  NOTICE_CATALOG.exportedChats,
  NOTICE_CATALOG.importedData,
]);

export function isSuccessNotice(message: string): boolean {
  return SUCCESS_NOTICES.has(message);
}

const MAX_NOTICE_LENGTH = 200;

function isAbortLike(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    if (/\baborted?\b/i.test(error.message)) return true;
    const cause = (error as Error & { detail?: unknown }).detail ?? error.cause;
    if (cause && cause !== error) return isAbortLike(cause);
  }
  return false;
}

/**
 * Map an arbitrary turn error onto a user-facing notice. Returns undefined for
 * user-initiated aborts (stopping a stream is not an error) and translates
 * common low-level failures into something actionable instead of surfacing
 * raw provider/runtime messages.
 */
export function describeErrorNotice(error: unknown): string | undefined {
  if (isAbortLike(error)) return undefined;
  const message = error instanceof Error ? error.message : '';
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) {
    return 'Network error. Check your connection and try again.';
  }
  if (/timed? ?out/i.test(message)) {
    return 'The request timed out. Please try again.';
  }
  if (!message.trim()) return 'An unexpected error occurred';
  return message.length > MAX_NOTICE_LENGTH
    ? `${message.slice(0, MAX_NOTICE_LENGTH - 1)}…`
    : message;
}

export const NOTICE_MISSING_CLIENT_KEY = NOTICE_CATALOG.missingClientKey;
export const NOTICE_MISSING_ANTHROPIC_KEY = NOTICE_CATALOG.missingAnthropicKey;
export const NOTICE_INVALID_KEY = NOTICE_CATALOG.invalidKey;
export const NOTICE_RATE_LIMITED = NOTICE_CATALOG.rateLimited;
export const NOTICE_MISSING_TAVILY_KEY = NOTICE_CATALOG.missingTavilyKey;
export const NOTICE_MODELS_UNAVAILABLE = NOTICE_CATALOG.modelsUnavailable;
export const NOTICE_EXPORTED_CHATS = NOTICE_CATALOG.exportedChats;
export const NOTICE_IMPORTED_DATA = NOTICE_CATALOG.importedData;
export const NOTICE_PLAN_APPLY_FAILED = NOTICE_CATALOG.planApplyFailed;
