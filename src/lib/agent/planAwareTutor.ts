/**
 * Plan-Aware Tutor Integration
 *
 * Connects learning plan and learner model to the tutor system.
 * Provides plan context for system prompts and manages plan progression.
 */

import type {
  LearningPlan,
  LearnerModel,
  LearningPlanNode,
  Message,
} from '@/lib/types';
import {
  getNextNode,
  updateNodeStatus,
  summarizeLearningPlan,
} from '@/lib/agent/planGenerator';
import { generateModelSummary } from '@/lib/agent/learnerModel';

/**
 * Generate plan context preamble for tutor system prompt
 * Injects learning plan and learner model information
 */
export function generatePlanContextPreamble(
  plan: LearningPlan,
  learnerModel?: LearnerModel,
): string {
  const currentNode = getNextNode(plan);

  // If plan is complete, return completion message
  if (!currentNode) {
    return [
      'LEARNING PLAN CONTEXT',
      '━━━━━━━━━━━━━━━━━━━━',
      'Student has completed all topics in the learning plan!',
      `Goal achieved: ${plan.goal}`,
      '',
      'Consider celebrating their achievement and offering next steps.',
    ].join('\n');
  }

  // Build plan summary
  const planSummary = summarizeLearningPlan(plan);

  // Build learner model summary
  const modelSummary = learnerModel
    ? generateModelSummary(learnerModel, plan)
    : 'Learner model not yet initialized - starting fresh assessment';

  // Build current focus section
  const focusSection = [
    `CURRENT FOCUS: ${currentNode.name}`,
    `Description: ${currentNode.description || 'No description'}`,
    'Learning Objectives:',
    ...currentNode.objectives.map((obj) => `  • ${obj}`),
  ].join('\n');

  // Build teaching strategy
  const strategySection = [
    'TEACHING STRATEGY:',
    '• Check prerequisite mastery before introducing new concepts',
    '• Adapt difficulty based on demonstrated confidence levels',
    '• Address known misconceptions proactively',
    '• Use Socratic method to build deep understanding',
    '• Provide practice opportunities at appropriate difficulty',
    '• Celebrate progress and build student confidence',
  ].join('\n');

  // Build progression rules
  const progressionSection = [
    'PROGRESSION RULES:',
    '• Confidence < 50%: More teaching and examples needed',
    '• Confidence 50-70%: Guided practice appropriate',
    '• Confidence > 70%: Ready for independent practice',
    '• Confidence > 80%: Consider advancing to next topic',
    '',
    'Note: You cannot explicitly advance topics. Focus on teaching the current',
    'topic deeply. The system will automatically advance when mastery is demonstrated.',
  ].join('\n');

  // Combine all sections
  return [
    'LEARNING PLAN CONTEXT',
    '━━━━━━━━━━━━━━━━━━━━',
    planSummary,
    '',
    modelSummary,
    '',
    focusSection,
    '',
    strategySection,
    '',
    progressionSection,
  ].join('\n');
}

/**
 * Determine if a node should be marked complete based on mastery
 */
export function shouldCompleteNode(
  nodeId: string,
  learnerModel: LearnerModel,
  plan: LearningPlan,
): {
  shouldComplete: boolean;
  reasoning: string;
} {
  const mastery = learnerModel.mastery[nodeId];
  const node = plan.nodes.find((n) => n.id === nodeId);

  if (!mastery) {
    return {
      shouldComplete: false,
      reasoning: 'No mastery data available for this node',
    };
  }

  if (!node) {
    return {
      shouldComplete: false,
      reasoning: 'Node not found in plan',
    };
  }

  // Already completed
  if (node.status === 'completed') {
    return {
      shouldComplete: false,
      reasoning: 'Node already marked as completed',
    };
  }

  // Check confidence threshold (70% = 0.7)
  if (mastery.confidence < 0.7) {
    return {
      shouldComplete: false,
      reasoning: `Confidence too low: ${Math.round(mastery.confidence * 100)}% (need 70%+)`,
    };
  }

  // Check for unresolved misconceptions
  const activeMisconceptions = mastery.misconceptions.filter(
    (m) => !m.resolved,
  );
  if (activeMisconceptions.length > 0) {
    return {
      shouldComplete: false,
      reasoning: `Has ${activeMisconceptions.length} unresolved misconception(s): ${activeMisconceptions.map((m) => m.description).join(', ')}`,
    };
  }

  // Check minimum interactions (at least 5 interactions needed)
  if (mastery.interactions < 5) {
    return {
      shouldComplete: false,
      reasoning: `Not enough practice: ${mastery.interactions} interactions (need 5+)`,
    };
  }

  // All checks passed
  return {
    shouldComplete: true,
    reasoning: `Confidence ${Math.round(mastery.confidence * 100)}%, ${mastery.interactions} interactions, no misconceptions`,
  };
}

/**
 * Process plan progress and auto-advance nodes when ready
 * Returns updated plan and changes made
 */
export async function processPlanProgress(
  plan: LearningPlan,
  learnerModel: LearnerModel,
): Promise<{
  updatedPlan: LearningPlan;
  planUpdates?: Message['planUpdates'];
  progressMessage?: string;
}> {
  const currentNode = getNextNode(plan);

  // If no current node, plan is complete
  if (!currentNode) {
    return {
      updatedPlan: plan,
      planUpdates: undefined,
      progressMessage: undefined,
    };
  }

  // Check if current node should be completed
  const { shouldComplete, reasoning } = shouldCompleteNode(
    currentNode.id,
    learnerModel,
    plan,
  );

  // Initialize plan updates
  const planUpdates: Message['planUpdates'] = {
    statusChanges: [],
    masteryChanges: [],
  };

  let updatedPlan = plan;
  let progressMessage: string | undefined;

  // Track mastery changes
  const currentMastery = learnerModel.mastery[currentNode.id];
  if (currentMastery) {
    // Find previous confidence (we don't have history, so just record current)
    planUpdates.masteryChanges!.push({
      nodeId: currentNode.id,
      from: currentMastery.confidence,
      to: currentMastery.confidence,
    });
  }

  if (shouldComplete && currentNode.status !== 'completed') {
    // Mark current node as completed
    updatedPlan = updateNodeStatus(updatedPlan, currentNode.id, 'completed');

    planUpdates.statusChanges!.push({
      nodeId: currentNode.id,
      from: currentNode.status,
      to: 'completed',
    });

    progressMessage = `🎉 Completed topic: ${currentNode.name}! ${reasoning}`;

    // Check for next node
    const nextNode = getNextNode(updatedPlan);
    if (nextNode) {
      // Start next node
      updatedPlan = updateNodeStatus(updatedPlan, nextNode.id, 'in_progress');

      planUpdates.statusChanges!.push({
        nodeId: nextNode.id,
        from: 'not_started',
        to: 'in_progress',
      });

      progressMessage += `\n➡️  Moving to next topic: ${nextNode.name}`;
    } else {
      // Plan complete!
      progressMessage += '\n\n🎊 Congratulations! You have completed the entire learning plan!';
    }
  }

  // Return results
  return {
    updatedPlan,
    planUpdates:
      planUpdates.statusChanges!.length > 0 ? planUpdates : undefined,
    progressMessage,
  };
}

/**
 * Check if plan is complete (all nodes completed)
 */
export function isPlanComplete(plan: LearningPlan): boolean {
  return plan.nodes.every((node) => node.status === 'completed');
}

/**
 * Get plan completion percentage
 */
export function getPlanCompletionPercentage(plan: LearningPlan): number {
  const completed = plan.nodes.filter(
    (node) => node.status === 'completed',
  ).length;
  return Math.round((completed / plan.nodes.length) * 100);
}

/**
 * Get estimated remaining time in minutes
 */
export function getEstimatedRemainingTime(plan: LearningPlan): number {
  return plan.nodes
    .filter((node) => node.status !== 'completed')
    .reduce((total, node) => total + (node.estimatedMinutes || 0), 0);
}

/**
 * Get topics that are ready to be worked on (prerequisites met, not completed)
 */
export function getReadyTopics(plan: LearningPlan): LearningPlanNode[] {
  const ready: LearningPlanNode[] = [];

  for (const node of plan.nodes) {
    if (node.status === 'completed') continue;

    // Check if all prerequisites are completed
    const prereqsMet = node.prerequisites.every((prereqId) => {
      const prereq = plan.nodes.find((n) => n.id === prereqId);
      return prereq && prereq.status === 'completed';
    });

    if (prereqsMet) {
      ready.push(node);
    }
  }

  return ready;
}

/**
 * Generate progress report for student
 */
export function generateProgressReport(
  plan: LearningPlan,
  learnerModel: LearnerModel,
): string {
  const completed = plan.nodes.filter(
    (node) => node.status === 'completed',
  ).length;
  const total = plan.nodes.length;
  const percentage = Math.round((completed / total) * 100);

  const lines: string[] = [
    `📊 Progress Report: ${plan.goal}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Completion: ${completed}/${total} topics (${percentage}%)`,
    '',
  ];

  // Add per-topic summary
  lines.push('Topic Status:');
  for (const node of plan.nodes) {
    const mastery = learnerModel.mastery[node.id];
    const confidence = mastery
      ? Math.round(mastery.confidence * 100)
      : 0;

    let status = '○ Not started';
    if (node.status === 'completed') {
      status = '✓ Completed';
    } else if (node.status === 'in_progress') {
      status = '⚡ In progress';
    }

    lines.push(`${status} | ${node.name} (${confidence}% confidence)`);
  }

  // Add global metrics
  if (learnerModel.globalMetrics) {
    lines.push('');
    lines.push('Overall Performance:');
    lines.push(
      `• Accuracy: ${Math.round(learnerModel.globalMetrics.accuracyRate * 100)}%`,
    );
    lines.push(
      `• Average Confidence: ${Math.round(learnerModel.globalMetrics.averageConfidence * 100)}%`,
    );
    lines.push(
      `• Total Interactions: ${learnerModel.globalMetrics.totalInteractions}`,
    );
  }

  // Add time estimate
  const remainingTime = getEstimatedRemainingTime(plan);
  if (remainingTime > 0) {
    lines.push('');
    const hours = Math.floor(remainingTime / 60);
    const mins = remainingTime % 60;
    lines.push(
      `Estimated time remaining: ${hours}h ${mins}m`,
    );
  }

  return lines.join('\n');
}
