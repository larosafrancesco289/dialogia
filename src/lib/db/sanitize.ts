import type { DeepResearchEvent, Message } from '@/lib/types';

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

  if (typeof next.reasoning === 'string') {
    const trace = parseDeepResearchTrace(next.reasoning);
    if (trace) {
      const answer =
        typeof next.content === 'string' && next.content.length > 0 ? next.content : undefined;
      if (!next.deepResearch) {
        next.deepResearch = { trace, answer };
      } else if (!next.deepResearch.trace || next.deepResearch.trace.length === 0) {
        next.deepResearch = { ...next.deepResearch, trace, answer: next.deepResearch.answer ?? answer };
      }
      delete next.reasoning;
      changed = true;
    }
  }

  return { next, changed };
}

const DEEP_RESEARCH_EVENT_TYPES = new Set(['search', 'fetch', 'time', 'note', 'thought']);

function parseDeepResearchTrace(reasoning: string): DeepResearchEvent[] | null {
  const trimmed = reasoning.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const trace: DeepResearchEvent[] = [];
    for (const item of parsed) {
      if (!isDeepResearchEvent(item)) return null;
      trace.push(item);
    }
    return trace;
  } catch {
    return null;
  }
}

function isDeepResearchEvent(value: unknown): value is DeepResearchEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === 'string' && DEEP_RESEARCH_EVENT_TYPES.has(record.type);
}
