// Module: agent/tools/tutor/contentPriority
// Responsibility: The tutor module's answer to "which content tool should win this
// round" — the phase knowledge the core scheduler no longer carries.

import type { TutorPhase } from '@/lib/agent/tutor/types';
import { getTutorToolsByPriorityGroup } from '@/lib/agent/tools/tutor/register';

export type TutorContentPriorityContext = {
  phase?: TutorPhase;
  hasPlan?: boolean;
  hasActiveNode?: boolean;
};

function uniqueList(items: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  items.forEach((item) => {
    if (!item || seen.has(item)) return;
    seen.add(item);
    ordered.push(item);
  });
  return ordered;
}

function orderedNames(context: TutorContentPriorityContext): string[] {
  const practice = getTutorToolsByPriorityGroup('practice');
  const plan = getTutorToolsByPriorityGroup('plan');
  const diagnostic = getTutorToolsByPriorityGroup('diagnostic');
  const intake = getTutorToolsByPriorityGroup('intake');
  const { phase, hasPlan, hasActiveNode } = context;

  if (phase === 'intake') return uniqueList([...intake, ...diagnostic, ...plan]);
  if (phase === 'diagnostic') return uniqueList([...diagnostic, practice[0], practice[1]]);
  if (phase === 'planning') return uniqueList([...plan, ...diagnostic, ...intake]);
  if (phase === 'practice') return uniqueList(practice);
  if (phase === 'review') return uniqueList([practice[0]]);
  if (phase === 'teaching') {
    return uniqueList([practice[0], practice[1], practice[2], ...plan]);
  }

  if (!hasPlan) return uniqueList([...intake, ...diagnostic, ...plan, ...practice]);
  if (!hasActiveNode) return uniqueList([...diagnostic, ...plan, ...practice]);
  return uniqueList([...practice, ...plan]);
}

/**
 * Builds the `contentPriority` callback the core scheduler consumes: candidates are
 * returned ranked, with names the tutor does not rank falling to the end.
 */
export function buildTutorContentPriority(
  context: TutorContentPriorityContext,
): (candidates: string[]) => string[] {
  return (candidates) => {
    const ranking = orderedNames(context);
    const rank = (name: string) => {
      const index = ranking.indexOf(name);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...candidates].sort((a, b) => rank(a) - rank(b));
  };
}
