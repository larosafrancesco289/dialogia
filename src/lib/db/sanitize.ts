import type { Message } from '@/lib/types';

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
      next.attachments = filtered;
      changed = true;
    }
    if (filtered.length === 0) {
      delete next.attachments;
      changed = true;
    }
  }

  if (next.tutor && typeof next.tutor === 'object') {
    const keys = Object.keys(next.tutor).filter((key) => {
      const value = (next.tutor as any)[key];
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

  return { next, changed };
}
