import type {
  PlanTurnOptions,
  PlanTurnResult,
  SearchResult,
  ToolDefinition,
  TutorToolName,
} from '@/lib/agent/types';
import type { TutorPhase, TutorToolPolicy } from '@/lib/agent/tutor/state';

export type PlanningContext = {
  phase: TutorPhase;
  planningToolDefinition?: ToolDefinition[];
  allowedTutorTools: Set<TutorToolName>;
  toolPolicy: TutorToolPolicy;
};

export type PlanningExecutionState = {
  aggregatedResults: SearchResult[];
  usedTutorContentTool: boolean;
  learnerModel?: PlanTurnResult['learnerModel'];
  planUpdates?: PlanTurnResult['planUpdates'];
  updatedPlan?: PlanTurnResult['updatedPlan'];
  learnerModelDebug?: PlanTurnResult['learnerModelDebug'];
  currentPlan?: PlanTurnOptions['chat']['settings']['features']['tutor']['learningPlan'];
  toolsUsedThisTurn: number;
  quizCallsThisTurn: number;
};
