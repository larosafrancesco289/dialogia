// Module: agent/planning/moduleResult
// Responsibility: Read and write the content-module slot of PlanningExecutionState.
// Core owns the slot because the fields are core types; which module fills it is
// none of core's business, and an absent module simply leaves it empty.

import type { ContentModuleResult, PlanningExecutionState } from '@/lib/agent/planning/types';

const CONTENT_MODULE_SLOT = 'contentModule';

const EMPTY: ContentModuleResult = {};

export function readContentModuleResult(state: PlanningExecutionState): ContentModuleResult {
  const slot = state.moduleState[CONTENT_MODULE_SLOT];
  return slot ? (slot as ContentModuleResult) : EMPTY;
}

export function withContentModuleResult(
  state: PlanningExecutionState,
  patch: ContentModuleResult,
): PlanningExecutionState {
  if (Object.keys(patch).length === 0) return state;
  return {
    ...state,
    moduleState: {
      ...state.moduleState,
      [CONTENT_MODULE_SLOT]: { ...readContentModuleResult(state), ...patch },
    },
  };
}
