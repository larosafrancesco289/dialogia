import {
  getToolCategory,
  isSearchTool,
  isTutorContentTool,
  isTutorMetaTool,
  tutorContentTools,
  tutorMetaTools,
  type ToolCategory,
} from '@/lib/agent/tools/metadata';

export { isTutorContentTool, isTutorMetaTool, isSearchTool, tutorContentTools, tutorMetaTools };
export type { ToolCategory };

export function categorizeTool(name: string): ToolCategory {
  return getToolCategory(name);
}
