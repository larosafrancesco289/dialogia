// Module: store/notices
// Responsibility: Centralize user-facing notice messages used across slices and services.

import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import { isRecord } from '@/lib/utils/guards';

export const NOTICE_CATALOG = {
  invalidKey: 'That API key was rejected. Check it in Settings › Connections.',
  rateLimited: 'The provider is limiting requests. Wait a moment, then try again.',
  missingSearchKey: 'Add a web search key in Settings › Connections to use tool-based search.',
  searchUnavailable: 'Web search is unavailable for this chat; answering without it.',
  modelsUnavailable: 'Could not load the model list.',
  unknownEndpoint:
    'This chat uses a provider endpoint that no longer exists. Re-add it in Settings › Connections, or pick another model.',
  exportedChats: 'Exported chats to JSON',
  planApplyFailed: 'The plan could not be applied. Try again.',
  copyFailed: 'Could not copy: the browser blocked clipboard access.',
  replyInOtherTab:
    'Another tab is writing a reply in this chat. Send once it has finished, so both tabs keep the same conversation.',
  saveFailed:
    'The reply could not be saved to this browser. It is on screen now, but may be cut short after a reload.',
  consolidationFailed:
    'Memory could not be consolidated. Nothing was changed; try again in a moment.',
  consolidationStale:
    'Memory changed while it was being consolidated, so nothing was changed. Consolidate again.',
  consolidationPartlyUndone:
    'Consolidation was undone, apart from what has changed since, which was left as it is.',
  memoryChangedSince: 'This note has changed since. Edit it on the Memory page.',
  memoryAlreadyForgotten:
    'This note is already forgotten. It waits in Recently forgotten on the Memory page.',
  consolidationNoModel: 'Connect a model in Settings › Connections to consolidate memory.',
} as const;

export type NoticeId = keyof typeof NOTICE_CATALOG;

const ATTACHMENT_KIND_LABELS: Record<string, string> = {
  image: 'images',
  audio: 'audio',
  pdf: 'PDFs',
};

/** Attachments the chosen model cannot read are removed; say so rather than silently sending less. */
export function describeDroppedAttachments(kinds: string[]): string {
  const labels = kinds.map((kind) => ATTACHMENT_KIND_LABELS[kind] ?? kind);
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
      : (labels[0] ?? '');
  // Audio alone is one thing; every other kind, and any list, is several.
  const verb = labels.length === 1 && kinds[0] === 'audio' ? 'was' : 'were';
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${verb} left out: this model does not accept them.`;
}

export function resolveNotice(notice?: NoticeId | string): string | undefined {
  if (!notice) return undefined;
  return NOTICE_CATALOG[notice as NoticeId] ?? notice;
}

const MAX_NOTICE_LENGTH = 200;

export function isAbortLike(error: unknown): boolean {
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
  // A refused key or a rate limit reads the same wherever it surfaced: before
  // the stream, in its first response, or in one of its chunks.
  if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
    return NOTICE_INVALID_KEY;
  }
  if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
    return NOTICE_RATE_LIMITED;
  }
  const fromBody = httpErrorNotice(error);
  if (fromBody) return clip(fromBody);
  const message = error instanceof Error ? error.message : '';
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) {
    return 'Could not reach the provider. Check your connection, or that your local server is running.';
  }
  if (/timed? ?out/i.test(message)) {
    return 'The request timed out. Try again.';
  }
  if (!message.trim()) return 'Something went wrong, and the provider did not say what.';
  return clip(readable(message));
}

function clip(text: string): string {
  return text.length > MAX_NOTICE_LENGTH ? `${text.slice(0, MAX_NOTICE_LENGTH - 1)}…` : text;
}

/**
 * A failed HTTP response in words: what happened and the status, then the
 * provider's own explanation from the body rather than the body itself. The
 * error keeps its full message and body for the logs.
 */
function httpErrorNotice(error: unknown): string | undefined {
  if (!isApiError(error) || typeof error.status !== 'number') return undefined;
  if (error.detail instanceof Error) return undefined;
  const statusMark = ` (${error.status})`;
  const at = error.message.indexOf(statusMark);
  if (at < 0) return undefined;
  const head = readable(error.message.slice(0, at + statusMark.length));
  const said = providerErrorText(error.detail);
  if (said) return `${head}: ${said}`;
  return error.status >= 500 ? `${head}. Try again in a moment.` : `${head}.`;
}

const MAX_BODY_DEPTH = 4;

/**
 * The explanation inside a provider's error body: the innermost `message`
 * (OpenRouter wraps the upstream provider's own error as JSON text in
 * `metadata.raw`), a bare `error` string, or a `detail` ({"detail":"Not
 * Found"}). Undefined for an HTML page, a proxy's 502 say, whose markup tells
 * a person nothing.
 */
function providerErrorText(body: unknown, depth = 0): string | undefined {
  if (depth > MAX_BODY_DEPTH || body == null) return undefined;
  if (typeof body === 'string') {
    const text = body.trim();
    if (!text || /^<|<\/?(html|body|head)\b/i.test(text)) return undefined;
    if (/^[[{]/.test(text)) {
      try {
        return providerErrorText(JSON.parse(text), depth + 1);
      } catch {
        return text;
      }
    }
    return text;
  }
  if (Array.isArray(body)) {
    // FastAPI's validation errors: [{ "msg": "..." }]
    const first: unknown = body[0];
    return isRecord(first) && typeof first.msg === 'string' ? first.msg : undefined;
  }
  if (!isRecord(body)) return undefined;
  const error = isRecord(body.error) ? body.error : body;
  if (isRecord(error.metadata)) {
    const inner = providerErrorText(error.metadata.raw, depth + 1);
    if (inner) return inner;
  }
  for (const value of [error.message, body.error, error.detail]) {
    const text = typeof value === 'string' || Array.isArray(value) ? value : undefined;
    const said = providerErrorText(text, depth + 1);
    if (said) return said;
  }
  return undefined;
}

// Transport errors read "openrouter_chat_failed (400): detail"; a person
// should see what happened, with the provider's own words after it.
const CODE_PREFIXES: Array<[RegExp, string]> = [
  [/^(openrouter|provider)_chat_failed\b/, 'The model provider returned an error'],
  [/^(openrouter|provider)_models_failed\b/, 'Could not load the model list'],
  [/^stream_missing_body\b/, 'The provider sent an empty response'],
];

function readable(message: string): string {
  for (const [pattern, text] of CODE_PREFIXES) {
    if (pattern.test(message)) return message.replace(pattern, text);
  }
  return message;
}

export const NOTICE_INVALID_KEY = NOTICE_CATALOG.invalidKey;
export const NOTICE_RATE_LIMITED = NOTICE_CATALOG.rateLimited;
export const NOTICE_MISSING_SEARCH_KEY = NOTICE_CATALOG.missingSearchKey;
export const NOTICE_MODELS_UNAVAILABLE = NOTICE_CATALOG.modelsUnavailable;
export const NOTICE_UNKNOWN_ENDPOINT = NOTICE_CATALOG.unknownEndpoint;
export const NOTICE_EXPORTED_CHATS = NOTICE_CATALOG.exportedChats;
export const NOTICE_PLAN_APPLY_FAILED = NOTICE_CATALOG.planApplyFailed;
export const NOTICE_REPLY_IN_OTHER_TAB = NOTICE_CATALOG.replyInOtherTab;
export const NOTICE_SAVE_FAILED = NOTICE_CATALOG.saveFailed;
export const NOTICE_CONSOLIDATION_FAILED = NOTICE_CATALOG.consolidationFailed;
export const NOTICE_CONSOLIDATION_STALE = NOTICE_CATALOG.consolidationStale;
export const NOTICE_CONSOLIDATION_PARTLY_UNDONE = NOTICE_CATALOG.consolidationPartlyUndone;
export const NOTICE_MEMORY_CHANGED_SINCE = NOTICE_CATALOG.memoryChangedSince;
export const NOTICE_MEMORY_ALREADY_FORGOTTEN = NOTICE_CATALOG.memoryAlreadyForgotten;
export const NOTICE_CONSOLIDATION_NO_MODEL = NOTICE_CATALOG.consolidationNoModel;
