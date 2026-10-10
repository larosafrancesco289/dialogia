// Module: store/notices
// Responsibility: Centralize user-facing notice messages used across slices and services.

import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import type { Message } from '@/lib/types';
import { isRecord } from '@/lib/utils/guards';
import { t, type MessageKey } from '@/lib/i18n';
import { capitalize, formatList } from '@/lib/i18n/format';
import en from '@/lib/i18n/messages/en';

// Each notice is said in the language shown when it is shown. The constants
// below are its English words, which code may compare and pass around (a tool
// error, a reply's stored cut-off reason); `resolveNotice` turns an id or those
// words into the language shown.
const NOTICE_KEYS = {
  invalidKey: 'notice.invalidKey',
  expiredKey: 'notice.expiredKey',
  rateLimited: 'notice.rateLimited',
  missingSearchKey: 'notice.missingSearchKey',
  searchUnavailable: 'notice.searchUnavailable',
  unknownEndpoint: 'notice.unknownEndpoint',
  exportedChats: 'notice.exportedChats',
  planApplyFailed: 'notice.planApplyFailed',
  planChangesFailed: 'notice.planChangesFailed',
  copyFailed: 'notice.copyFailed',
  replyInOtherTab: 'notice.replyInOtherTab',
  saveFailed: 'notice.saveFailed',
  consolidationFailed: 'notice.consolidationFailed',
  consolidationUnreadable: 'notice.consolidationUnreadable',
  consolidationUndone: 'notice.consolidationUndone',
  consolidationStale: 'notice.consolidationStale',
  consolidationPartlyUndone: 'notice.consolidationPartlyUndone',
  memoryChangedSince: 'notice.memoryChangedSince',
  memoryAlreadyForgotten: 'notice.memoryAlreadyForgotten',
  consolidationNoModel: 'notice.consolidationNoModel',
  replacedReplyChangedMemory: 'notice.replacedReplyChangedMemory',
  unreachable: 'notice.unreachable',
  timedOut: 'notice.timedOut',
  cutOff: 'notice.cutOff',
  stalled: 'notice.stalled',
  unknownError: 'notice.unknownError',
  zdrUnavailable: 'zdr.unavailable',
} as const satisfies Record<string, MessageKey>;

export type NoticeId = keyof typeof NOTICE_KEYS;

/** Each notice's English words, by id. */
export const NOTICE_CATALOG = Object.fromEntries(
  Object.entries(NOTICE_KEYS).map(([id, key]) => [id, en[key]]),
) as { readonly [Id in NoticeId]: (typeof en)[(typeof NOTICE_KEYS)[Id]] };

const KEY_BY_ENGLISH = new Map<string, MessageKey>(
  Object.values(NOTICE_KEYS).map((key) => [en[key], key]),
);

const ATTACHMENT_KIND_LABELS: Record<string, MessageKey> = {
  image: 'notice.kind.image',
  audio: 'notice.kind.audio',
  pdf: 'notice.kind.pdf',
};

/** Attachments the chosen model cannot read are removed; say so rather than silently sending less. */
export function describeDroppedAttachments(kinds: string[]): string {
  const labels = kinds.map((kind) => {
    const key = ATTACHMENT_KIND_LABELS[kind];
    return key ? t(key) : kind;
  });
  const list = formatList(labels);
  // Audio alone is one thing; every other kind, and any list, is several.
  const one = labels.length === 1 && kinds[0] === 'audio';
  return capitalize(t(one ? 'notice.droppedOne' : 'notice.droppedMany', { list }));
}

/** An empty model list names where it was asked for, so the person knows which server to check. */
export function describeNoModelsOffered(labels: string[]): string {
  return t('notice.noModelsOffered', { servers: formatList(labels) });
}

/** A notice in the language shown: by its id, by its English words, or as given. */
export function resolveNotice(notice?: NoticeId | string): string | undefined {
  if (!notice) return undefined;
  const key = NOTICE_KEYS[notice as NoticeId] ?? KEY_BY_ENGLISH.get(notice);
  return key ? t(key) : notice;
}

const MAX_NOTICE_LENGTH = 200;

export function isAbortLike(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    // A provider's own words never mean the person pressed Stop, even when
    // they say "Upstream request aborted"; the browser's own abort is named.
    if (!isApiError(error) && /\baborted?\b/i.test(error.message)) return true;
    const cause = (error as Error & { detail?: unknown }).detail ?? error.cause;
    if (cause && cause !== error) return isAbortLike(cause);
  }
  return false;
}

/** How a reply that ended on `error` is marked: stopped by the person, or failed and why. */
export function cutOffFor(error: unknown): Pick<Message, 'cutOff' | 'cutOffReason'> {
  if (isAbortLike(error)) return { cutOff: 'stopped', cutOffReason: undefined };
  return { cutOff: 'failed', cutOffReason: describeErrorNotice(error) };
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
    return /expired/i.test(providerErrorText(error.detail) ?? '')
      ? NOTICE_EXPIRED_KEY
      : NOTICE_INVALID_KEY;
  }
  if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
    return NOTICE_RATE_LIMITED;
  }
  if (isApiError(error) && error.code === API_ERROR_CODES.STREAM_CUT_OFF) {
    return NOTICE_CATALOG.cutOff;
  }
  if (isApiError(error) && error.code === API_ERROR_CODES.STREAM_STALLED) {
    return NOTICE_CATALOG.stalled;
  }
  const fromBody = httpErrorNotice(error);
  if (fromBody) return clip(fromBody);
  const message = error instanceof Error ? error.message : '';
  // A transport wraps the browser's TypeError ("Load failed" on iOS when the
  // app is backgrounded mid-reply) as its detail, under its own code.
  const said = errorChainMessages(error).join('\n');
  if (/failed to fetch|load failed|networkerror|network request failed|network error/i.test(said)) {
    return NOTICE_CATALOG.unreachable;
  }
  if (/timed? ?out/i.test(said)) {
    return NOTICE_CATALOG.timedOut;
  }
  if (!message.trim()) return NOTICE_CATALOG.unknownError;
  return clip(readable(message));
}

/** The messages of an error and of the errors it wraps, outermost first. */
function errorChainMessages(error: unknown, depth = 0): string[] {
  if (!(error instanceof Error) || depth > MAX_BODY_DEPTH) return [];
  const inner = (error as Error & { detail?: unknown }).detail ?? error.cause;
  return [error.message, ...(inner !== error ? errorChainMessages(inner, depth + 1) : [])];
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
  return error.status >= 500 ? `${head}. ${t('notice.tryAgainSoon')}` : `${head}.`;
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
const CODE_PREFIXES: Array<[RegExp, MessageKey]> = [
  [/^(openrouter|provider)_chat_failed\b/, 'notice.providerError'],
  [/^(openrouter|provider)_models_failed\b/, 'notice.modelListFailed'],
  [/^stream_missing_body\b/, 'notice.emptyResponse'],
];

function readable(message: string): string {
  for (const [pattern, key] of CODE_PREFIXES) {
    if (pattern.test(message)) return message.replace(pattern, t(key));
  }
  return message;
}

export const NOTICE_INVALID_KEY = NOTICE_CATALOG.invalidKey;
export const NOTICE_EXPIRED_KEY = NOTICE_CATALOG.expiredKey;
export const NOTICE_RATE_LIMITED = NOTICE_CATALOG.rateLimited;
export const NOTICE_MISSING_SEARCH_KEY = NOTICE_CATALOG.missingSearchKey;
export const NOTICE_UNKNOWN_ENDPOINT = NOTICE_CATALOG.unknownEndpoint;
export const NOTICE_EXPORTED_CHATS = NOTICE_CATALOG.exportedChats;
export const NOTICE_PLAN_APPLY_FAILED = NOTICE_CATALOG.planApplyFailed;
export const NOTICE_PLAN_CHANGES_FAILED = NOTICE_CATALOG.planChangesFailed;
export const NOTICE_REPLY_IN_OTHER_TAB = NOTICE_CATALOG.replyInOtherTab;
export const NOTICE_SAVE_FAILED = NOTICE_CATALOG.saveFailed;
export const NOTICE_CONSOLIDATION_FAILED = NOTICE_CATALOG.consolidationFailed;
export const NOTICE_CONSOLIDATION_UNREADABLE = NOTICE_CATALOG.consolidationUnreadable;
export const NOTICE_CONSOLIDATION_UNDONE = NOTICE_CATALOG.consolidationUndone;
export const NOTICE_CONSOLIDATION_STALE = NOTICE_CATALOG.consolidationStale;
export const NOTICE_CONSOLIDATION_PARTLY_UNDONE = NOTICE_CATALOG.consolidationPartlyUndone;
export const NOTICE_MEMORY_CHANGED_SINCE = NOTICE_CATALOG.memoryChangedSince;
export const NOTICE_MEMORY_ALREADY_FORGOTTEN = NOTICE_CATALOG.memoryAlreadyForgotten;
export const NOTICE_CONSOLIDATION_NO_MODEL = NOTICE_CATALOG.consolidationNoModel;
export const NOTICE_REPLACED_REPLY_CHANGED_MEMORY = NOTICE_CATALOG.replacedReplyChangedMemory;
