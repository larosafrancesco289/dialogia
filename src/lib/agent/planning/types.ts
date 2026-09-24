import type { ToolDefinition } from '@/lib/agent/types';
import type { SearchResult } from '@/lib/search/types';

export type ToolGate = {
  /**
   * Per-turn allowlist. Stateful: a module may start refusing a name once its own
   * budget for that name is spent.
   */
  isAllowed(name: string): boolean;
  /** What core should do with a call the gate refused: drop it, or end the round. */
  onBudgetExceeded?(name: string): 'skip' | 'stop';
  /** Ranks competing content tools for the scheduler. */
  contentPriority?: (candidates: string[]) => string[];
  /** The module's cap on tool calls per turn, if it imposes one. */
  maxToolsPerTurn?: number;
  /** Core reports each scheduled call so the module can spend its budgets. */
  onScheduled?(name: string): void;
};

export type PlanningContext = {
  /** Already-gated tool list sent to the model. */
  toolDefinitions: ToolDefinition[];
  gate: ToolGate;
  /** Opaque per-module turn state; only the owning module interprets it. */
  moduleContext?: Record<string, unknown>;
};

export type PlanningExecutionState = {
  aggregatedResults: SearchResult[];
  usedContentTool: boolean;
  toolsUsedThisTurn: number;
  successfulToolCallsThisTurn: number;
  failedToolCallsThisTurn: number;
  /** Per-module turn state, keyed by module id. Typed accessors live in the module. */
  moduleState: Record<string, unknown>;
};

export function createPlanningExecutionState(
  overrides?: Partial<PlanningExecutionState>,
): PlanningExecutionState {
  return {
    aggregatedResults: [],
    usedContentTool: false,
    toolsUsedThisTurn: 0,
    successfulToolCallsThisTurn: 0,
    failedToolCallsThisTurn: 0,
    moduleState: {},
    ...overrides,
  };
}
