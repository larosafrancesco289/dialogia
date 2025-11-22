import type { TutorToolName } from '@/lib/agent/types';

const TUTOR_CONTENT_TOOLS: TutorToolName[] = [
  'ask_student_question',
  'create_diagnostic',
  'generate_plan',
  'update_plan',
  'quiz_mcq',
  'quiz_fill_blank',
  'quiz_open_ended',
  'flashcards',
  'srs_review',
];

const TUTOR_META_TOOLS: TutorToolName[] = [
  'assess_answer',
  'update_learner_model',
  'get_plan_suggestions',
  'grade_open_response',
  'add_to_deck',
];

const SEARCH_TOOLS = new Set(['web_search']);
const CONTENT_TOOL_SET = new Set<string>(TUTOR_CONTENT_TOOLS);
const META_TOOL_SET = new Set<string>(TUTOR_META_TOOLS);

export function isTutorContentTool(name: string): boolean {
  return CONTENT_TOOL_SET.has(name);
}

export function isTutorMetaTool(name: string): boolean {
  return META_TOOL_SET.has(name);
}

export function isSearchTool(name: string): boolean {
  return SEARCH_TOOLS.has(name);
}

export type ToolCategory =
  | 'tutor_content'
  | 'tutor_meta'
  | 'search'
  | 'other';

export function categorizeTool(name: string): ToolCategory {
  if (isTutorContentTool(name)) return 'tutor_content';
  if (isTutorMetaTool(name)) return 'tutor_meta';
  if (isSearchTool(name)) return 'search';
  return 'other';
}

export const tutorContentTools = TUTOR_CONTENT_TOOLS;
export const tutorMetaTools = TUTOR_META_TOOLS;
