import type {
  Message,
  MessageToolRound,
  MessageToolRoundCall,
  TutorEventRecord,
} from '@/lib/types';

const REMOVED_MESSAGE_KEYS = ['deepResearch'] as const;

const LEGACY_TUTOR_HIDDEN = /^\s*Tutor (Recap|Data JSON):/;

export function sanitizeMessageRecord(message: Message): { next: Message; changed: boolean } {
  const next: Message = { ...message };
  let changed = false;

  // The tutor used to copy its cards, answer keys included, into hiddenContent
  // so the model would see them. Tool rounds replace that; the copy is derived
  // from `tutor`, so dropping it loses nothing.
  if (
    next.tutor &&
    typeof next.hiddenContent === 'string' &&
    LEGACY_TUTOR_HIDDEN.test(next.hiddenContent)
  ) {
    delete next.hiddenContent;
    changed = true;
  }

  if ('tutorSeq' in next) {
    const seq = next.tutorSeq;
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
      delete next.tutorSeq;
      changed = true;
    }
  }

  if (typeof next.hiddenContent === 'string') {
    const trimmed = next.hiddenContent.trim();
    if (trimmed !== next.hiddenContent) changed = true;
    if (trimmed) next.hiddenContent = trimmed;
    else {
      delete next.hiddenContent;
      changed = true;
    }
  }

  if (!Array.isArray(next.attachments) || next.attachments.length === 0) {
    if (next.attachments) {
      delete next.attachments;
      changed = true;
    }
  } else {
    const filtered = next.attachments.filter(Boolean);
    if (filtered.length !== next.attachments.length) {
      changed = true;
    }
    const stripped = filtered.map((attachment) => {
      if (!attachment || typeof attachment !== 'object') return attachment;
      if (!('file' in attachment)) return attachment;
      const record = attachment as typeof attachment & { file?: unknown };
      if (record.file !== undefined) changed = true;
      const { file: _file, ...rest } = record;
      return rest;
    });
    next.attachments = stripped;
    if (next.attachments.length === 0) {
      delete next.attachments;
      changed = true;
    }
  }

  if (next.tutor && typeof next.tutor === 'object') {
    const tutor = next.tutor as Record<string, unknown>;
    const keys = Object.keys(tutor).filter((key) => {
      const value = tutor[key];
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === 'object') return Object.keys(value).length > 0;
      return value != null;
    });
    if (keys.length === 0) {
      delete next.tutor;
      changed = true;
    }
  }

  if ('toolRounds' in next) {
    const rounds = normalizeToolRounds(next.toolRounds);
    if (!rounds) {
      delete next.toolRounds;
      changed = true;
    } else if (rounds.changed) {
      next.toolRounds = rounds.value;
      changed = true;
    }
  }

  if (next.tutorWelcome === false) {
    delete next.tutorWelcome;
    changed = true;
  }

  // Legacy deep-research messages can hold their only answer text in
  // `deepResearch.answer` with an empty `content`; fold it in before the field
  // is dropped so the text survives the strip.
  const legacyDeepResearch = (next as Record<string, unknown>).deepResearch;
  if (
    (!next.content || !next.content.trim()) &&
    legacyDeepResearch &&
    typeof legacyDeepResearch === 'object' &&
    typeof (legacyDeepResearch as { answer?: unknown }).answer === 'string' &&
    (legacyDeepResearch as { answer: string }).answer.trim()
  ) {
    next.content = (legacyDeepResearch as { answer: string }).answer;
    changed = true;
  }

  // Removed features whose records may still sit in older IndexedDB rows.
  for (const key of REMOVED_MESSAGE_KEYS) {
    if (key in next) {
      delete (next as Record<string, unknown>)[key];
      changed = true;
    }
  }

  return { next, changed };
}

const isString = (value: unknown): value is string => typeof value === 'string';

function normalizeToolRoundCall(value: unknown): MessageToolRoundCall | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const call = value as Record<string, unknown>;
  if (!isString(call.id) || !isString(call.name) || !call.name) return undefined;
  if (!isString(call.arguments) || !isString(call.result)) return undefined;
  return { id: call.id, name: call.name, arguments: call.arguments, result: call.result };
}

/**
 * Keeps only well-formed rounds, and only rounds with at least one call: a
 * replayed assistant tool-call message with no calls, or a call with no
 * result, is something no provider accepts. Undefined when nothing survives.
 */
function normalizeToolRounds(
  value: unknown,
): { value: MessageToolRound[]; changed: boolean } | undefined {
  if (!Array.isArray(value)) return undefined;
  let changed = false;
  const rounds: MessageToolRound[] = [];
  for (const entry of value) {
    const round = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
    const rawCalls = round && Array.isArray(round.calls) ? round.calls : [];
    const calls = rawCalls
      .map(normalizeToolRoundCall)
      .filter((call): call is MessageToolRoundCall => !!call);
    if (!round || calls.length === 0) {
      changed = true;
      continue;
    }
    const text = isString(round.text) ? round.text : '';
    const extraKeys = Object.keys(round).some((key) => key !== 'text' && key !== 'calls');
    if (calls.length !== rawCalls.length || text !== round.text || extraKeys) changed = true;
    rounds.push({ text, calls });
  }
  return rounds.length > 0 ? { value: rounds, changed } : undefined;
}

const EVENT_ACTORS = new Set<unknown>(['tutor', 'learner', 'system']);

/**
 * The envelope of a stored tutor event, or undefined when it is malformed. The
 * payload is the tutor module's to check; a row without a usable id, chat,
 * position, time, actor and type cannot be ordered or folded by anyone.
 */
export function sanitizeTutorEventRecord(value: unknown): TutorEventRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const { id, chatId, seq, at, by, type, messageId } = record;
  if (!isString(id) || !id || !isString(chatId) || !chatId) return undefined;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) return undefined;
  if (typeof at !== 'number' || !Number.isFinite(at)) return undefined;
  if (!EVENT_ACTORS.has(by) || !isString(type) || !type) return undefined;
  const next = { ...record } as TutorEventRecord;
  if (messageId !== undefined && (!isString(messageId) || !messageId)) delete next.messageId;
  return next;
}
