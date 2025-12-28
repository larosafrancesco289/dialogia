import type { DeepResearchEvent } from '@/lib/types';
import { isRecord } from '@/lib/utils/guards';

export const DEEP_RESEARCH_EVENT_TYPES = new Set<DeepResearchEvent['type']>([
  'search',
  'fetch',
  'time',
  'note',
  'thought',
]);

export function isDeepResearchEvent(value: unknown): value is DeepResearchEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === 'string' &&
    DEEP_RESEARCH_EVENT_TYPES.has(value.type as DeepResearchEvent['type'])
  );
}
