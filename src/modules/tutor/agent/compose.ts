// Module: modules/tutor/agent/compose
// Responsibility: The tutor module's contribution to a turn's request payload —
// its tool list, its system preambles, and whether the turn needs the planning loop.

import type { ModuleComposeArgs, ModuleComposeContribution } from '@/lib/modules';
import type { ToolDefinition } from '@/lib/agent/types';
import { getTutorPreamble, getTutorToolDefinitions } from '@/modules/tutor/agent/preamble';
import { getTutorPhase, getTutorToolEligibility } from '@/modules/tutor/agent/state';
import { isTutorToolName } from '@/modules/tutor/tools/register';
import { getNextNode } from '@/modules/tutor/learning-plan/service';
import tutorProfileService from '@/modules/tutor/lib/profile';

export async function buildTutorComposeContribution({
  chat,
  ui,
  settings,
  priorMessages,
}: ModuleComposeArgs): Promise<ModuleComposeContribution | undefined> {
  if (!settings.tutorEnabled) return undefined;

  const learningPlan = chat.settings.features.tutor?.learningPlan;
  const phase = getTutorPhase(chat, priorMessages, ui);
  const activeNodeId = learningPlan ? getNextNode(learningPlan)?.id : undefined;
  const { allowedTutorTools } = getTutorToolEligibility({ chat, ui, phase, activeNodeId });

  const tools: ToolDefinition[] = getTutorToolDefinitions().filter((def) => {
    const name = def.function?.name;
    return !!name && isTutorToolName(name) && allowedTutorTools.has(name);
  });

  const stablePreambles: string[] = [];
  const dynamicPreambles: string[] = [];

  const tutorPreamble = getTutorPreamble();
  if (tutorPreamble) stablePreambles.push(tutorPreamble);

  try {
    const profile = await tutorProfileService.loadTutorProfile(chat.id);
    const summary = tutorProfileService.summarizeTutorProfile(profile);
    if (summary) stablePreambles.push(`Learner Profile:\n${summary}`);
  } catch {
    // ignore profile load failures
  }

  // Tutor always sees the numerical learner model (it's internal system state).
  // learnerModelVisible controls student-facing UI only, not tutor context.
  if (learningPlan) {
    const { generatePlanContextPreamble } = await import('@/modules/tutor/agent/planContext');
    const { getLatestLearnerModel } = await import('@/modules/tutor/learner-model');
    const planContext = generatePlanContextPreamble(
      learningPlan,
      getLatestLearnerModel(priorMessages),
      { includeLearnerModel: true },
    );
    if (planContext) dynamicPreambles.push(planContext);
  }

  if (settings.tutorNudge) {
    stablePreambles.push(`Learner Preference: ${settings.tutorNudge.replace(/_/g, ' ')}`);
  }

  return {
    tools,
    stablePreambles,
    dynamicPreambles,
    requiresPlanning: true,
    // The tutor preamble is a complete system prompt on its own.
    replacesBaseSystem: true,
  };
}
