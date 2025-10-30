// Module: agent/compose
// Responsibility: Build per-turn request payload pieces (system, messages, tools, plugins, routing)
// by inspecting chat state, UI preferences, and prepared attachments.

import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { getTutorPreamble, getTutorToolDefinitions } from '@/lib/agent/tutor';
import { composePlugins, providerSortFromRoutePref } from '@/lib/agent/request';
import { getSearchToolDefinition } from '@/lib/agent/searchFlow';
import { type ComposeTurnArgs, type TurnComposition, type ToolDefinition } from '@/lib/agent/types';
import tutorProfileService from '@/lib/tutorProfile';
import { combineSystem } from '@/lib/agent/system';

const TOOL_PREAMBLE =
  'You have access to a function tool named "web_search" that retrieves up-to-date web results.\n\nWhen you need current, factual, or source-backed information, call the tool first. If you call a tool, respond with ONLY tool_calls (no user-facing text). After the tool returns, write the final answer that cites sources inline as [n] using the numbering provided.\n\nweb_search(args): { query: string, count?: integer 1-10 }. Choose a focused query and a small count, and avoid unnecessary calls.';

export async function composeTurn({
  chat,
  ui,
  modelIndex,
  prior,
  newUser,
  attachments,
}: ComposeTurnArgs): Promise<TurnComposition> {
  const tutorGloballyEnabled = !!ui.experimentalTutor;
  const forceTutorMode = !!(ui.forceTutorMode ?? false);
  const tutorEnabled =
    tutorGloballyEnabled && (forceTutorMode || Boolean(chat.settings.tutor_mode));

  const searchEnabled = !!chat.settings.search_enabled;
  const configuredProvider =
    ((chat.settings as any)?.search_provider as TurnComposition['search']['provider']) ||
    'openrouter';
  const searchProvider =
    ui.experimentalBrave && configuredProvider === 'brave' ? 'brave' : 'openrouter';

  const priorMessages = prior ?? [];
  const preparedAttachments = attachments ?? newUser?.attachments ?? [];
  const hadPdfEarlier = priorMessages.some((m) =>
    Array.isArray(m.attachments) && m.attachments.some((att: any) => att?.kind === 'pdf'),
  );
  const hasPdf =
    preparedAttachments.some((att: any) => att?.kind === 'pdf') || (hadPdfEarlier ? true : false);

  const plugins = composePlugins({
    hasPdf,
    searchEnabled,
    searchProvider,
  });

  const searchTools: ToolDefinition[] =
    searchEnabled && searchProvider === 'brave' ? getSearchToolDefinition() : [];
  const tutorTools: ToolDefinition[] = tutorEnabled ? getTutorToolDefinitions() : [];
  const tools = [...searchTools, ...tutorTools];

  const preambles: string[] = [];
  if (searchEnabled && searchProvider === 'brave') {
    preambles.push(TOOL_PREAMBLE);
  }
  if (tutorEnabled) {
    const tutorPreamble = tutorGloballyEnabled ? getTutorPreamble() : '';
    if (tutorPreamble) preambles.push(tutorPreamble);
    try {
      const profile = await tutorProfileService.loadTutorProfile(chat.id);
      const summary = tutorProfileService.summarizeTutorProfile(profile);
      if (summary) preambles.push(`Learner Profile:\n${summary}`);
    } catch {
      // ignore profile load failures
    }

    // Add learning plan context if plan exists
    if (chat.settings.learningPlan) {
      const { generatePlanContextPreamble } = await import('@/lib/agent/planAwareTutor');
      const { getLatestLearnerModel } = await import('@/lib/agent/learnerModel');
      const learnerModel = getLatestLearnerModel(priorMessages);
      const planContext = generatePlanContextPreamble(
        chat.settings.learningPlan,
        learnerModel,
      );
      if (planContext) preambles.push(planContext);
    }

    if (ui.nextTutorNudge) {
      preambles.push(`Learner Preference: ${ui.nextTutorNudge.replace(/_/g, ' ')}`);
    }
  }

  const baseSystem =
    typeof chat.settings.system === 'string' ? chat.settings.system : undefined;
  const system = combineSystem(baseSystem, preambles);

  const newUserContent = newUser?.content;
  const userAttachments = preparedAttachments.length > 0 ? preparedAttachments : undefined;
  const modelList = Array.isArray(modelIndex?.all) ? modelIndex.all : [];
  const messages = buildChatCompletionMessages({
    chat,
    priorMessages,
    models: modelList,
    newUserContent,
    newUserAttachments: userAttachments,
  });

  const providerSort = providerSortFromRoutePref(ui.routePreference);
  const shouldPlan = tutorEnabled || (searchEnabled && searchProvider === 'brave');

  return {
    system,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    plugins: Array.isArray(plugins) && plugins.length > 0 ? plugins : undefined,
    providerSort,
    hasPdf,
    shouldPlan,
    search: {
      enabled: searchEnabled,
      provider: searchProvider,
    },
    tutor: {
      enabled: tutorEnabled,
    },
    consumedTutorNudge: tutorEnabled ? ui.nextTutorNudge : undefined,
  };
}
