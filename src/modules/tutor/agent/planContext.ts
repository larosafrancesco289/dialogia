import type { LearningPlan, LearnerModel } from '@/lib/types';
import { getNextNode, summarizeLearningPlan } from '@/modules/tutor/learning-plan/service';
import { generateModelSummary } from '@/modules/tutor/learner-model';

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
    '• Follow the learning plan topic order by default.',
    '• Do not skip, reorder, or omit topics through conversation alone — use tools to make changes official.',
    '• If the student already knows the current topic, verify briefly and call advance_topic to move past it quickly.',
    '• If the student asks to skip, move on, or says they already understand: call advance_topic.',
    '• If the student asks to reorder topics or focus on something different: call learning_plan to restructure the plan.',
    '• If the student pushes back on a mastery score ("I actually know this" or "that score is too high/low"): call record_learning with source \'self_report\' (NOT \'assessment\'). The source MUST be self_report when the student is contesting their own score.',
    "• After the student solves practice problems correctly: call record_learning with source 'assessment' to update mastery, then call advance_topic if confidence is high enough.",
    '• IMPORTANT: When calling record_learning or advance_topic, use the EXACT nodeId shown in square brackets in the plan (e.g., "limit-definition", "power-rule"). Do NOT invent or abbreviate node IDs.',
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
