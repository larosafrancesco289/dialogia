import type { LearningPlan, LearnerModel } from '@/lib/types';
import { getNextNode, summarizeLearningPlan } from '@/lib/learningPlan/service';
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
