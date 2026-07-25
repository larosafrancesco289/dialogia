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
import { buildSearchDateNotice, buildToolPreamble } from '@/lib/agent/prompts/toolPreamble';
import { buildTimestampNotice } from '@/lib/agent/prompts/timestamps';

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
  const hasPdf = preparedAttachments.some((att) => att.kind === 'pdf') || hadPdfEarlier;

  const plugins = composePlugins({ hasPdf, searchEnabled, searchProvider });

  const tutorPhase = tutorEnabled ? getTutorPhase(chat, priorMessages as Message[], ui) : undefined;
  const activeNodeId =
    tutorEnabled && chat.settings.features.tutor.learningPlan
      ? getNextNode(chat.settings.features.tutor.learningPlan)?.id
      : undefined;
  const allowedTutorTools =
    tutorEnabled && tutorPhase
      ? getTutorToolEligibility({ chat, ui, phase: tutorPhase, activeNodeId }).allowedTutorTools
      : undefined;

  const searchTools: ToolDefinition[] =
    searchEnabled && searchProvider === 'tavily' ? getSearchToolDefinition() : [];
  const tutorTools: ToolDefinition[] =
    tutorEnabled && allowedTutorTools
      ? getTutorToolDefinitions().filter((def) => {
          const name = def.function?.name;
          if (!name || !isTutorToolName(name)) return false;
          return allowedTutorTools.has(name);
        })
      : [];
  const tools = [...searchTools, ...tutorTools];

  // Collect preambles split into stable (cacheable) and dynamic (per-turn) groups.
  // Stable: tool preamble, tutor preamble, learner profile, learner preference.
  // Dynamic: plan context (includes mastery scores that change each turn).
  const stablePreambles: string[] = [];
  const dynamicPreambles: string[] = [];
  if (settings.timestampsEnabled) {
    stablePreambles.push(buildTimestampNotice());
  }
  if (searchEnabled) {
    // Stable within a day; grounds the model in the real date so it trusts
    // post-cutoff facts enough to search instead of denying them.
    stablePreambles.push(buildSearchDateNotice());
    if (searchProvider === 'tavily') stablePreambles.push(buildToolPreamble());
  }
  if (tutorEnabled) {
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
    if (chat.settings.features.tutor.learningPlan) {
      const { generatePlanContextPreamble } = await import('@/lib/agent/tutor/planContext');
      const { getLatestLearnerModel } = await import('@/lib/agent/learner-model');
      const planContext = generatePlanContextPreamble(
        chat.settings.features.tutor.learningPlan,
        getLatestLearnerModel(priorMessages),
        { includeLearnerModel: true },
      );
      if (planContext) dynamicPreambles.push(planContext);
    }

    if (settings.tutorNudge) {
      stablePreambles.push(`Learner Preference: ${settings.tutorNudge.replace(/_/g, ' ')}`);
    }
  }

  // When tutor is enabled, the tutor preamble is complete - don't add the normal system prompt
  const baseSystem =
    !tutorEnabled && typeof settings.system === 'string' ? settings.system : undefined;
  const preambles = [...stablePreambles, ...dynamicPreambles];
  const system = combineSystem(baseSystem, preambles);
  const systemStable =
    stablePreambles.length > 0 ? combineSystem(baseSystem, stablePreambles) : undefined;
  const systemDynamic = dynamicPreambles.length > 0 ? dynamicPreambles.join('\n\n') : undefined;

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
    timestamps: settings.timestampsEnabled,
  });

  const shouldPlan = tutorEnabled || (searchEnabled && searchProvider === 'tavily');

  return {
    system,
    systemStable,
    systemDynamic,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    plugins: Array.isArray(plugins) && plugins.length > 0 ? plugins : undefined,
    hasPdf,
    shouldPlan,
    settings,
    consumedTutorNudge: tutorEnabled ? settings.tutorNudge : undefined,
  };
}
