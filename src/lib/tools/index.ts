// Module: tools
// Responsibility: Public surface of the tool layer. The registry is populated by
// `loadModuleRuntimes()` at the start of a turn; importing this module has no side
// effects, so it stays out of the boot bundle.

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
