import { isTutorContentTool, isTutorMetaTool, isSearchTool } from '@/lib/agent/tools/categories';
import { getTutorToolsByPriorityGroup } from '@/lib/agent/tools/metadata';
import type { ToolCall } from '@/lib/agent/types';
import type { TutorPhase } from '@/lib/agent/tutor/state';

export type ScheduleContext = {
  hasPlan?: boolean;
  hasActiveNode?: boolean;
  alreadyUsedContent?: boolean;
  allowSearch?: boolean;
  phase?: TutorPhase;
};

const PRACTICE_TOOLS = getTutorToolsByPriorityGroup('practice');
const PLAN_TOOLS = getTutorToolsByPriorityGroup('plan');
const DIAGNOSTIC_TOOLS = getTutorToolsByPriorityGroup('diagnostic');
const INTAKE_TOOLS = getTutorToolsByPriorityGroup('intake');

function uniqueList<T extends string>(items: readonly T[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  items.forEach((item) => {
    if (seen.has(item)) return;
    seen.add(item);
    ordered.push(item);
  });
  return ordered;
}

function buildContentPriority(context: ScheduleContext): string[] {
  const { phase, hasPlan, hasActiveNode } = context;
  if (phase === 'intake') return uniqueList([...INTAKE_TOOLS, ...DIAGNOSTIC_TOOLS, ...PLAN_TOOLS]);
  if (phase === 'diagnostic') {
    return uniqueList([...DIAGNOSTIC_TOOLS, PRACTICE_TOOLS[0], PRACTICE_TOOLS[1]]);
  }
  if (phase === 'planning') {
    return uniqueList([...PLAN_TOOLS, ...DIAGNOSTIC_TOOLS, ...INTAKE_TOOLS]);
  }
  if (phase === 'practice') return uniqueList([...PRACTICE_TOOLS]);
  if (phase === 'review') return uniqueList(['flashcards', 'srs_review', PRACTICE_TOOLS[0]]);
  if (phase === 'teaching') {
    return uniqueList([
      PRACTICE_TOOLS[0],
      PRACTICE_TOOLS[1],
      PRACTICE_TOOLS[2],
      'flashcards',
      ...PLAN_TOOLS,
    ]);
  }

  if (!hasPlan) {
    return uniqueList([...INTAKE_TOOLS, ...DIAGNOSTIC_TOOLS, ...PLAN_TOOLS, ...PRACTICE_TOOLS]);
  }
  if (!hasActiveNode) {
    return uniqueList([...DIAGNOSTIC_TOOLS, ...PLAN_TOOLS, ...PRACTICE_TOOLS]);
  }
  return uniqueList([...PRACTICE_TOOLS, ...PLAN_TOOLS]);
}

function pickContentTool(candidates: ToolCall[], context: ScheduleContext): ToolCall | undefined {
  if (context.alreadyUsedContent || candidates.length === 0) return undefined;
  const priority = buildContentPriority(context);
  const firstByName = new Map<string, ToolCall>();
  candidates.forEach((call) => {
    const name = call.function?.name ?? '';
    if (!name) return;
    if (!firstByName.has(name)) firstByName.set(name, call);
  });

  for (const name of priority) {
    const hit = firstByName.get(name);
    if (hit) return hit;
  }

  return candidates[0];
}

export function schedulePlanningToolCalls(
  toolCalls: ToolCall[],
  context: ScheduleContext = {},
): ToolCall[] {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
  const meta: ToolCall[] = [];
  const contentCandidates: ToolCall[] = [];
  const others: ToolCall[] = [];
  let search: ToolCall | undefined;

  toolCalls.forEach((call) => {
    const name = call.function?.name ?? '';
    if (!name) return;
    if (isTutorMetaTool(name)) {
      meta.push(call);
      return;
    }
    if (isTutorContentTool(name)) {
      if (!context.alreadyUsedContent) contentCandidates.push(call);
      return;
    }
    if (isSearchTool(name)) {
      if (!search && context.allowSearch !== false) search = call;
      return;
    }
    others.push(call);
  });

  const content = pickContentTool(contentCandidates, context);
  const ordered: ToolCall[] = [];
  ordered.push(...meta);
  if (search) ordered.push(search);
  if (content) ordered.push(content);
  if (others.length > 0) ordered.push(...others);
  return ordered;
}
