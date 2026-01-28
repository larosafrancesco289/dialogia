import { TUTOR_TOOL_NAMES } from '@/lib/agent/types';
import type { ToolName, TutorToolName } from '@/lib/agent/types';
import type { TutorPhase } from '@/lib/agent/tutor/state';

export type ToolCategory = 'tutor_content' | 'tutor_meta' | 'search' | 'other';

export type TutorToolTag =
  | 'quiz'
  | 'plan'
  | 'learnerModel'
  | 'thesisCore'
  | 'baseline'
  | 'diagnostic';

export type TutorToolPriorityGroup = 'intake' | 'diagnostic' | 'plan' | 'practice';

type ToolTags = Partial<Record<TutorToolTag, true>>;

export type ToolMetadata = {
  category: ToolCategory;
  phases?: TutorPhase[];
  priorityGroup?: TutorToolPriorityGroup;
  tags?: ToolTags;
};

export const TOOL_METADATA: Record<ToolName, ToolMetadata> = {
  web_search: { category: 'search' },
  ask_student_question: {
    category: 'tutor_content',
    phases: ['intake'],
    priorityGroup: 'intake',
    tags: { baseline: true, thesisCore: true },
  },
  create_diagnostic: {
    category: 'tutor_content',
    phases: ['intake', 'diagnostic'],
    priorityGroup: 'diagnostic',
    tags: { diagnostic: true, thesisCore: true },
  },
  generate_plan: {
    category: 'tutor_content',
    phases: ['intake', 'planning'],
    priorityGroup: 'plan',
    tags: { plan: true, thesisCore: true },
  },
  update_plan: {
    category: 'tutor_content',
    phases: ['planning'],
    priorityGroup: 'plan',
    tags: { plan: true, thesisCore: true },
  },
  assess_answer: {
    category: 'tutor_meta',
    phases: ['diagnostic', 'practice', 'review', 'teaching'],
    tags: { baseline: true, thesisCore: true },
  },
  update_learner_model: {
    category: 'tutor_meta',
    phases: ['diagnostic', 'practice', 'review', 'teaching'],
    tags: { learnerModel: true, thesisCore: true },
  },
  advance_topic: {
    category: 'tutor_meta',
    phases: ['teaching', 'practice', 'review'],
    tags: { plan: true, thesisCore: true },
  },
  apply_learner_model_feedback: {
    category: 'tutor_meta',
    phases: ['diagnostic', 'practice', 'review', 'teaching'],
    tags: { learnerModel: true, thesisCore: true },
  },
  get_plan_suggestions: {
    category: 'tutor_meta',
    phases: ['planning'],
    tags: { plan: true, thesisCore: true },
  },
  quiz_mcq: {
    category: 'tutor_content',
    phases: ['diagnostic', 'practice', 'teaching'],
    priorityGroup: 'practice',
    tags: { quiz: true },
  },
  quiz_fill_blank: {
    category: 'tutor_content',
    phases: ['diagnostic', 'practice', 'teaching'],
    priorityGroup: 'practice',
    tags: { quiz: true },
  },
  quiz_open_ended: {
    category: 'tutor_content',
    phases: ['practice', 'teaching'],
    priorityGroup: 'practice',
    tags: { quiz: true },
  },
  flashcards: {
    category: 'tutor_content',
    phases: ['practice', 'review', 'teaching'],
    priorityGroup: 'practice',
    tags: { quiz: true },
  },
  grade_open_response: {
    category: 'tutor_meta',
    phases: ['practice', 'teaching'],
    tags: { quiz: true },
  },
  add_to_deck: {
    category: 'tutor_meta',
    phases: ['practice', 'teaching'],
    tags: { quiz: true },
  },
  srs_review: {
    category: 'tutor_content',
    phases: ['review'],
    priorityGroup: 'practice',
    tags: { quiz: true },
  },
};

const tutorToolNames = [...TUTOR_TOOL_NAMES] as TutorToolName[];

export function getToolCategory(name: string): ToolCategory {
  return TOOL_METADATA[name as ToolName]?.category ?? 'other';
}

export function isTutorContentTool(name: string): boolean {
  return getToolCategory(name) === 'tutor_content';
}

export function isTutorMetaTool(name: string): boolean {
  return getToolCategory(name) === 'tutor_meta';
}

export function isSearchTool(name: string): boolean {
  return getToolCategory(name) === 'search';
}

export function getTutorToolsByPhase(phase: TutorPhase): TutorToolName[] {
  return tutorToolNames.filter((name) => TOOL_METADATA[name].phases?.includes(phase));
}

export function getTutorToolsByTag(tag: TutorToolTag): TutorToolName[] {
  return tutorToolNames.filter((name) => TOOL_METADATA[name].tags?.[tag]);
}

export function getTutorToolsByPriorityGroup(group: TutorToolPriorityGroup): TutorToolName[] {
  return tutorToolNames.filter((name) => TOOL_METADATA[name].priorityGroup === group);
}

export const tutorContentTools = tutorToolNames.filter((name) => isTutorContentTool(name));
export const tutorMetaTools = tutorToolNames.filter((name) => isTutorMetaTool(name));
