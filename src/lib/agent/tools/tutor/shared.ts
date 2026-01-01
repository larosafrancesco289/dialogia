import { v4 as uuidv4 } from 'uuid';
import type { MessageTutor, TutorPlanSuggestion } from '@/lib/types';

export type TutorQuizPayload = {
  items: Array<{ id: string; [key: string]: unknown }>;
};

const CONTENT_KEYS: Array<keyof MessageTutor> = [
  'questionnaire',
  'diagnostic',
  'planProposal',
  'mcq',
  'fillBlank',
  'openEnded',
  'flashcards',
];

export function normalizeTutorQuizPayload(args: unknown): TutorQuizPayload | null {
  if (!args || typeof args !== 'object') return null;
  const record = args as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items : [];
  if (items.length === 0) return null;
  const normalized = items.slice(0, 40).map((item) => {
    const data = item as Record<string, unknown>;
    const rawId = typeof data.id === 'string' ? data.id.trim() : '';
    const id = !rawId || rawId === 'null' || rawId === 'undefined' ? uuidv4() : rawId;
    return { ...data, id };
  });
  return { items: normalized };
}

const PLAN_SUGGESTION_PRIORITIES = new Set(['low', 'medium', 'high']);

export function normalizePlanSuggestions(items: unknown[]): TutorPlanSuggestion[] {
  return items
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const action = typeof record.action === 'string' ? record.action.trim() : undefined;
      if (!action) return null;
      const priorityRaw =
        typeof record.priority === 'string' ? record.priority.trim().toLowerCase() : undefined;
      const priority =
        priorityRaw && PLAN_SUGGESTION_PRIORITIES.has(priorityRaw) ? priorityRaw : undefined;
      const description =
        typeof record.description === 'string' ? record.description.trim() : undefined;
      const rationale = typeof record.rationale === 'string' ? record.rationale.trim() : undefined;
      const estimatedImpact =
        typeof record.estimatedImpact === 'string' ? record.estimatedImpact.trim() : undefined;
      const implementationDetails =
        record.implementationDetails && typeof record.implementationDetails === 'object'
          ? (record.implementationDetails as Record<string, unknown>)
          : undefined;
      return {
        action,
        priority: priority as 'low' | 'medium' | 'high' | undefined,
        description,
        rationale,
        estimatedImpact,
        implementationDetails,
      };
    })
    .filter(Boolean) as TutorPlanSuggestion[];
}

export function withContentReset(
  activeKey: keyof MessageTutor,
  patch: Partial<MessageTutor>,
): Partial<MessageTutor> {
  const reset: Partial<MessageTutor> = {};
  CONTENT_KEYS.forEach((key) => {
    if (key === activeKey) return;
    reset[key] = undefined;
  });
  reset.attempts = undefined;
  reset.grading = undefined;
  return { ...reset, ...patch };
}
