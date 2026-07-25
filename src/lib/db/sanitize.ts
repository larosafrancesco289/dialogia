import type { Message } from '@/lib/types';

const REMOVED_MESSAGE_KEYS = ['deepResearch'] as const;

export function sanitizeMessageRecord(message: Message): { next: Message; changed: boolean } {
  const next: Message = { ...message };
  let changed = false;

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

  if (next.tutorWelcome === false) {
    delete next.tutorWelcome;
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
