import type { LearningPlan, LearnerModel } from '@/lib/types';
import { getNextNode } from '@/lib/learning-plan/service';

/**
 * Generate learner model summary for tutor context
 * Formats mastery data in a concise, readable format
 */
export function generateModelSummary(model: LearnerModel, plan: LearningPlan): string {
  const lines: string[] = ['STUDENT MASTERY'];

  // Find current node
  const currentNode = getNextNode(plan);

  for (const node of plan.nodes) {
    const mastery = model.mastery[node.id];
    if (!mastery) continue;

    const confidence = Math.round(mastery.confidence * 100);

    // Status indicator
    let status = '○';
    if (node.id === currentNode?.id) {
      status = '⚡';
    } else if (node.status === 'completed') {
      status = '✓';
    } else if (node.status === 'in_progress') {
      status = '→';
    }

    lines.push(
      `${status} ${node.name}: ${confidence}% confident (${mastery.interactions} interactions)`,
    );

    // Include active misconceptions
    const activeMisconceptions = mastery.misconceptions.filter((m) => !m.resolved);
    if (activeMisconceptions.length > 0) {
      for (const m of activeMisconceptions) {
        lines.push(`  ⚠️  ${m.description} (seen ${m.occurrences}x)`);
      }
    }
  }

  // Add overall metrics
  if (model.globalMetrics) {
    lines.push('');
    lines.push(
      `Overall: ${Math.round(model.globalMetrics.accuracyRate * 100)}% accuracy, ` +
        `${Math.round(model.globalMetrics.averageConfidence * 100)}% avg confidence`,
    );
  }

  return lines.join('\n');
}
