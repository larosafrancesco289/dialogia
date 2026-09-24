// Module: tools
// Responsibility: Public surface of the tool layer. The registry is populated by
// `loadModuleRuntimes()` at the start of a turn; importing this module has no side
// effects, so it stays out of the boot bundle.

export {
  getToolHandler,
  getToolLogCategory,
  isContentTool,
  isMetaTool,
  isReplayTool,
} from '@/lib/tools/registry';
export { isSearchTool } from '@/lib/tools/core/searchTools';
/** @internal The registry tests read and edit the registry through this surface. */
export {
  getTool,
  getToolKind,
  isRegisteredTool,
  listTools,
  registerTool,
  unregisterTool,
  type PlanningToolHandler,
} from '@/lib/tools/registry';
