// Module: tools
// Responsibility: Public surface of the tool layer. Importing this module guarantees
// that every enabled feature module has registered its tools, so prefer it over
// importing `@/lib/tools/registry` directly (module registration files are the
// exception — they must import the registry to avoid a cycle).

import { registerEnabledModules } from '@/lib/modules';

registerEnabledModules();

export {
  getTool,
  getToolDefinitions,
  getToolExt,
  getToolHandler,
  getToolKind,
  getToolLogCategory,
  getToolModule,
  isContentTool,
  isMetaTool,
  isRegisteredTool,
  listTools,
  registerTool,
  unregisterTool,
  type PlanningToolHandler,
  type ToolFilter,
  type ToolKind,
  type ToolMetadata,
  type ToolRegistryEntry,
} from '@/lib/tools/registry';
export { isSearchTool } from '@/lib/tools/core/searchTools';
export type {
  PlanningToolExecutionResult,
  ToolExecutionArgs,
  ToolExecutionContext,
} from '@/lib/tools/execution';
export { extractTutorToolCalls, parseJsonAfter } from '@/lib/tools/json';
