// Module: agent/compose
// Responsibility: Build per-turn request payload pieces (system, messages, tools, plugins, routing)
// by inspecting chat state, UI preferences, and prepared attachments.

import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import { getTutorPreamble, getTutorToolDefinitions } from '@/lib/agent/tutor';
import {
  getTutorPhase,
  allowedTutorToolsForPhase,
  deriveTutorToolPolicy,
} from '@/lib/agent/tutor/state';
import { composePlugins } from '@/lib/agent/request';
import { getSearchToolDefinition } from '@/lib/agent/searchFlow';
import { type ComposeTurnArgs, type TurnComposition, type ToolDefinition } from '@/lib/agent/types';
import tutorProfileService from '@/lib/tutor/profile';
import { combineSystem } from '@/lib/agent/system';
import { getNextNode } from '@/lib/learningPlan/service';
import { isTutorToolName } from '@/lib/agent/tools';
import type { Message } from '@/lib/types';

const TOOL_PREAMBLE =
  'You have access to a function tool named "web_search" that retrieves up-to-date web results.\n\nWhen you need current, factual, or source-backed information, call the tool first. If you call a tool, respond with ONLY tool_calls (no user-facing text). After the tool returns, write the final answer that cites sources inline as [n] using the numbering provided.\n\nweb_search(args): { query: string, count?: integer 1-10 }. Choose a focused query and a small count, and avoid unnecessary calls.';

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
  const generation = settings.generation;
  const searchEnabled = !!generation.searchEnabled;
  const searchProvider = generation.searchProvider || 'openrouter';

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
    tutorEnabled && chat.settings.learningPlan
      ? getNextNode(chat.settings.learningPlan)?.id
      : undefined;
  const tutorToolPolicy = tutorEnabled
    ? deriveTutorToolPolicy({
        chat,
        ui,
        activeNodeId,
      })
    : undefined;
  const allowedTutorTools =
    tutorEnabled && tutorPhase
      ? new Set(allowedTutorToolsForPhase(tutorPhase, tutorToolPolicy))
      : undefined;

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
    const tutorPreamble = tutorEnabled ? getTutorPreamble() : '';
    if (tutorPreamble) preambles.push(tutorPreamble);
    if (tutorToolPolicy) {
      if (tutorToolPolicy.thesisMode) {
        preambles.push(
          [
            'TUTOR THESIS MODE',
            '- Default to natural language coaching; keep tool calls minimal.',
            '- Use planning + learner model tools; reserve MCQ/diagnostics for readiness or end-of-topic checks.',
            '- Limit MCQ blocks to one small set per topic.',
            '- Prefer a single targeted tool call per turn.',
          ].join('\n'),
        );
      }
      if (tutorToolPolicy.researchMode && tutorToolPolicy.researchMode !== 'plan_plus_model') {
        preambles.push(
          `Research mode: ${tutorToolPolicy.researchMode}. Align responses with this visibility (plan/learner model) and tool exposure.`,
        );
      }
    }
    try {
      const profile = await tutorProfileService.loadTutorProfile(chat.id);
      const summary = tutorProfileService.summarizeTutorProfile(profile);
      if (summary) preambles.push(`Learner Profile:\n${summary}`);
    } catch {
      // ignore profile load failures
    }

    // Add learning plan context if plan exists
    const allowPlanContext = tutorToolPolicy?.researchMode !== 'model_only';
    const allowLearnerModelContext = tutorToolPolicy?.researchMode !== 'plan_only';
    if (allowPlanContext && chat.settings.learningPlan) {
      const { generatePlanContextPreamble } = await import('@/lib/agent/tutor/planContext');
      const { getLatestLearnerModel } = await import('@/lib/agent/learnerModel');
      const learnerModel = allowLearnerModelContext
        ? getLatestLearnerModel(priorMessages)
        : undefined;
      const planContext = generatePlanContextPreamble(chat.settings.learningPlan, learnerModel);
      if (planContext) preambles.push(planContext);
    }

    if (settings.tutorNudge) {
      preambles.push(`Learner Preference: ${settings.tutorNudge.replace(/_/g, ' ')}`);
    }
  }

  const baseSystem = typeof settings.system === 'string' ? settings.system : undefined;
  const system = combineSystem(baseSystem, preambles);

  const chatForMessages = {
    ...chat,
    settings: {
      ...chat.settings,
      model: settings.modelId,
      system: settings.system ?? chat.settings.system,
      max_tokens: settings.generation.maxTokens ?? chat.settings.max_tokens,
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
