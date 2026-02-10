// Module: agent/compose
// Responsibility: Build per-turn request payload pieces (system, messages, tools, plugins, routing)
// by inspecting chat state, UI preferences, and prepared attachments.

import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import { getTutorPreamble, getTutorToolDefinitions } from '@/lib/agent/tutor';
import { getTutorPhase, getTutorToolEligibility } from '@/lib/agent/tutor/state';
import { composePlugins } from '@/lib/agent/request';
import { getSearchToolDefinition } from '@/lib/search';
import { type ComposeTurnArgs, type TurnComposition, type ToolDefinition } from '@/lib/agent/types';
import tutorProfileService from '@/lib/tutor/profile';
import { combineSystem } from '@/lib/agent/system';
import { getNextNode } from '@/lib/learning-plan/service';
import { isTutorToolName } from '@/lib/agent/tools';
import type { Message } from '@/lib/types';
import { TOOL_PREAMBLE } from '@/lib/agent/prompts/toolPreamble';

export async function composeTurn({
  chat,
  ui,
  settings,
  modelIndex,
  prior,
  newUser,
  attachments,
}: ComposeTurnArgs): Promise<TurnComposition> {
  const tutorEnabled = settings.tutorEnabled;
  const searchEnabled = settings.searchEnabled;

  const searchProvider = settings.searchProvider || 'openrouter';

  const priorMessages = prior ?? [];
  const preparedAttachments = attachments ?? newUser?.attachments ?? [];
  const hadPdfEarlier = priorMessages.some(
    (m) => Array.isArray(m.attachments) && m.attachments.some((att) => att.kind === 'pdf'),
  );
  const hasPdf =
    preparedAttachments.some((att) => att.kind === 'pdf') || (hadPdfEarlier ? true : false);

  const plugins = composePlugins({ hasPdf, searchEnabled, searchProvider });

  const tutorPhase = tutorEnabled ? getTutorPhase(chat, priorMessages as Message[], ui) : undefined;
  const activeNodeId =
    tutorEnabled && chat.settings.features.tutor.learningPlan
      ? getNextNode(chat.settings.features.tutor.learningPlan)?.id
      : undefined;
  const tutorEligibility =
    tutorEnabled && tutorPhase
      ? getTutorToolEligibility({
          chat,
          ui,
          phase: tutorPhase,
          activeNodeId,
        })
      : undefined;
  const tutorToolPolicy = tutorEligibility?.toolPolicy;
  const allowedTutorTools = tutorEligibility?.allowedTutorTools;

  const searchTools: ToolDefinition[] =
    searchEnabled && searchProvider === 'brave' ? getSearchToolDefinition() : [];
  const tutorTools: ToolDefinition[] =
    tutorEnabled && allowedTutorTools
      ? getTutorToolDefinitions().filter((def) => {
          const name = def.function?.name;
          if (!name || !isTutorToolName(name)) return false;
          return allowedTutorTools.has(name);
        })
      : [];
  const tools = [...searchTools, ...tutorTools];

  const preambles: string[] = [];
  if (searchEnabled && searchProvider === 'brave') {
    preambles.push(TOOL_PREAMBLE);
  }
  if (tutorEnabled) {
    const tutorPreamble = getTutorPreamble();
    if (tutorPreamble) preambles.push(tutorPreamble);
    try {
      const profile = await tutorProfileService.loadTutorProfile(chat.id);
      const summary = tutorProfileService.summarizeTutorProfile(profile);
      if (summary) preambles.push(`Learner Profile:\n${summary}`);
    } catch {
      // ignore profile load failures
    }

    // Add learning plan context if plan exists
    const allowPlanContext = tutorToolPolicy?.researchMode !== 'model_only';
    // Tutor always sees the numerical learner model (it's internal system state).
    // learnerModelVisible controls student-facing UI only, not tutor context.
    const allowLearnerModelContext = tutorToolPolicy?.researchMode !== 'plan_only';
    if (allowPlanContext && chat.settings.features.tutor.learningPlan) {
      const { generatePlanContextPreamble } = await import('@/lib/agent/tutor/planContext');
      const { getLatestLearnerModel } = await import('@/lib/agent/learner-model');
      const learnerModel = allowLearnerModelContext
        ? getLatestLearnerModel(priorMessages)
        : undefined;
      const planContext = generatePlanContextPreamble(
        chat.settings.features.tutor.learningPlan,
        learnerModel,
        { includeLearnerModel: allowLearnerModelContext },
      );
      if (planContext) preambles.push(planContext);
    }

    if (settings.tutorNudge) {
      preambles.push(`Learner Preference: ${settings.tutorNudge.replace(/_/g, ' ')}`);
    }
  }

  // When tutor is enabled, the tutor preamble is complete - don't add the normal system prompt
  const baseSystem =
    !tutorEnabled && typeof settings.system === 'string' ? settings.system : undefined;
  const system = combineSystem(baseSystem, preambles);

  const chatForMessages = {
    ...chat,
    settings: {
      ...chat.settings,
      modelId: settings.modelId,
      system: settings.system ?? chat.settings.system,
      generation: {
        ...chat.settings.generation,
        maxTokens: settings.generation.maxTokens ?? chat.settings.generation.maxTokens,
      },
    },
  };
  const newUserContent = newUser?.content;
  const userAttachments = preparedAttachments.length > 0 ? preparedAttachments : undefined;
  const modelList = Array.isArray(modelIndex?.all) ? modelIndex.all : [];
  const messages = buildChatCompletionMessages({
    chat: chatForMessages,
    priorMessages,
    models: modelList,
    newUserContent,
    newUserAttachments: userAttachments,
  });

  const shouldPlan = tutorEnabled || (searchEnabled && searchProvider === 'brave');

  return {
    system,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    plugins: Array.isArray(plugins) && plugins.length > 0 ? plugins : undefined,
    hasPdf,
    shouldPlan,
    settings,
    consumedTutorNudge: tutorEnabled ? settings.tutorNudge : undefined,
  };
}
