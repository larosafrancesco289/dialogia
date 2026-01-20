
import type { ChatSettingsPatch, TutorResearchMode } from '@/lib/types';

/**
 * Ablation study conditions for thesis evaluation.
 * 2x2 factorial design: Plan visibility × Learner model visibility
 */
export type AblationCondition = 'full_system' | 'plan_only' | 'model_only' | 'baseline';

export const ABLATION_CONDITIONS: AblationCondition[] = [
  'full_system',
  'plan_only',
  'model_only',
  'baseline',
];

export type AblationConditionConfig = {
  id: AblationCondition;
  name: string;
  description: string;
  researchMode: TutorResearchMode;
  planVisible: boolean;
  planEditable: boolean;
  learnerModelVisible: boolean;
  learnerModelEditable: boolean;
};

export const CONDITION_CONFIGS: Record<AblationCondition, AblationConditionConfig> = {
  full_system: {
    id: 'full_system',
    name: 'Full System',
    description: 'Editable DAG curriculum + editable visible learner model',
    researchMode: 'plan_plus_model',
    planVisible: true,
    planEditable: true,
    learnerModelVisible: true,
    learnerModelEditable: true,
  },
  plan_only: {
    id: 'plan_only',
    name: 'Plan Only',
    description: 'Editable DAG curriculum, hidden learner model',
    researchMode: 'plan_only',
    planVisible: true,
    planEditable: true,
    learnerModelVisible: false,
    learnerModelEditable: false,
  },
  model_only: {
    id: 'model_only',
    name: 'Model Only',
    description: 'Hidden curriculum, editable visible learner model',
    researchMode: 'model_only',
    planVisible: false,
    planEditable: false,
    learnerModelVisible: true,
    learnerModelEditable: true,
  },
  baseline: {
    id: 'baseline',
    name: 'Baseline (ChatTutor-style)',
    description: 'Visible read-only tree curriculum, narrative learner profile only',
    researchMode: 'baseline_chat',
    planVisible: true,
    planEditable: false,
    learnerModelVisible: false,
    learnerModelEditable: false,
  },
};

/**
 * Get chat settings overrides for a given ablation condition.
 */
export function getConditionSettings(condition: AblationCondition): ChatSettingsPatch {
  const config = CONDITION_CONFIGS[condition];

  return {
    features: {
      tutor: {
        researchMode: config.researchMode,
        enableLearnerModel: config.learnerModelVisible,
        // Additional flags for fine-grained control (used by tutor/state.ts)
        thesisMode: true,
      },
    },
  };
}

/**
 * Comparison pairs for statistical analysis.
 * Each pair represents a hypothesis test.
 */
export const COMPARISON_PAIRS: Array<{
  name: string;
  hypothesis: string;
  conditions: [AblationCondition, AblationCondition];
}> = [
  {
    name: 'Full vs Baseline',
    hypothesis: 'Full system improves learning over ChatTutor-style baseline',
    conditions: ['full_system', 'baseline'],
  },
  {
    name: 'Full vs Plan-Only',
    hypothesis: 'Learner model visibility contributes to learning gains',
    conditions: ['full_system', 'plan_only'],
  },
  {
    name: 'Full vs Model-Only',
    hypothesis: 'Plan/curriculum visibility contributes to learning gains',
    conditions: ['full_system', 'model_only'],
  },
  {
    name: 'Plan-Only vs Model-Only',
    hypothesis: 'Direct comparison of plan vs model contribution',
    conditions: ['plan_only', 'model_only'],
  },
  {
    name: 'Plan-Only vs Baseline',
    hypothesis: 'Plan editability improves over read-only',
    conditions: ['plan_only', 'baseline'],
  },
  {
    name: 'Model-Only vs Baseline',
    hypothesis: 'Structured mastery tracking improves over narrative',
    conditions: ['model_only', 'baseline'],
  },
];

/**
 * Calculate interaction effect for 2x2 factorial design.
 * Interaction = (Full - PlanOnly) - (ModelOnly - Baseline)
 * Positive value indicates synergy between plan and model.
 */
export function calculateInteractionEffect(scores: {
  full_system: number;
  plan_only: number;
  model_only: number;
  baseline: number;
}): number {
  const planEffect = scores.full_system - scores.model_only;
  const planEffectWithoutModel = scores.plan_only - scores.baseline;
  return planEffect - planEffectWithoutModel;
}
