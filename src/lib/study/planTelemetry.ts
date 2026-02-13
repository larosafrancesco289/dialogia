export type PlanNodeSection = 'in_progress' | 'up_next' | 'completed' | 'locked' | 'unknown';

export type PlanInspectionDepth = 'scan' | 'inspect' | 'deep';

export type PlanInspectionMetrics = {
  dwellMs: number;
  interactionCount: number;
};

export function shouldLogPlanInspection(metrics: PlanInspectionMetrics): boolean {
  return metrics.dwellMs >= 3000 || metrics.interactionCount >= 1;
}

export function classifyPlanInspectionDepth(metrics: PlanInspectionMetrics): PlanInspectionDepth {
  const { dwellMs, interactionCount } = metrics;
  if (dwellMs >= 8000 || interactionCount >= 2) return 'deep';
  if (dwellMs >= 3000 || interactionCount >= 1) return 'inspect';
  return 'scan';
}
