import type { LearningPlan, LearnerModel } from '@/lib/types';
import { getNextNode, summarizeLearningPlan } from '@/lib/learning-plan/service';
import { generateModelSummary } from '@/lib/agent/learner-model';

/**
 * Generate plan context preamble for tutor system prompt
 * Injects learning plan and learner model information
 */
export function generatePlanContextPreamble(
  plan: LearningPlan,
  learnerModel?: LearnerModel,
  options?: { includeLearnerModel?: boolean },
): string {
  const includeLearnerModel = options?.includeLearnerModel ?? true;
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
  const modelSummary = includeLearnerModel
    ? learnerModel
      ? generateModelSummary(learnerModel, plan)
      : 'Learner model not yet initialized - starting fresh assessment'
    : undefined;

  // Build current focus section
  const focusSection = [
    `CURRENT FOCUS: ${currentNode.name} [${currentNode.id}]`,
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

  // Build curriculum sequencing rules
  const sequencingSection = [
    'CURRICULUM SEQUENCING:',
    '• You MUST teach topics in the order defined by the learning plan.',
    '• Do not skip, reorder, or omit topics through conversation alone.',
    '• If the student already knows the current topic, verify briefly and call advance_topic to move past it quickly.',
    '• If the student requests skipping or reordering, acknowledge their preference and cover the current topic as efficiently as possible so you can reach their priority sooner.',
  ].join('\n');

  // Build progression rules
  const progressionSection = [
    'PROGRESSION RULES:',
    '• Confidence < 50%: More teaching and examples needed',
    '• Confidence 50-70%: Guided practice appropriate',
    '• Confidence > 70%: Ready for independent practice',
    '• Confidence > 80%: Consider advancing to next topic',
    '',
    'You control topic progression. Call advance_topic when you judge the student',
    'has mastered the current topic. Use confidence levels and interaction quality as signals.',
  ].join('\n');

  // Combine all sections
  return [
    'LEARNING PLAN CONTEXT',
    '━━━━━━━━━━━━━━━━━━━━',
    planSummary,
    ...(modelSummary ? ['', modelSummary] : []),
    '',
    focusSection,
    '',
    strategySection,
    '',
    sequencingSection,
    '',
    progressionSection,
  ].join('\n');
}
