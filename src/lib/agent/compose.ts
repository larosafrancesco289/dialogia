// Module: agent/compose
// Responsibility: Build per-turn request payload pieces (system, messages, tools, plugins, routing)
// by inspecting chat state, UI preferences, and prepared attachments.

import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { getTutorPreamble, getTutorToolDefinitions } from '@/lib/agent/tutor';
import { composePlugins, providerSortFromRoutePref } from '@/lib/agent/request';
import { getSearchToolDefinition } from '@/lib/agent/searchFlow';
import { normalizeTutorMemory } from '@/lib/agent/tutorMemory';
import { type ComposeTurnArgs, type TurnComposition, type ToolDefinition } from '@/lib/agent/types';
import { loadTutorProfile, summarizeTutorProfile } from '@/lib/tutorProfile';

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

  const searchEnabled = !!chat.settings.search_with_brave;
  const configuredProvider =
    ((chat.settings as any)?.search_provider as TurnComposition['search']['provider']) || 'brave';
  const searchProvider = ui.experimentalBrave ? configuredProvider : 'openrouter';

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
  if (tutorEnabled) {
    const memoryBlock = normalizeTutorMemory(chat.settings.tutor_memory);
    if (typeof memoryBlock === 'string' && memoryBlock.trim()) {
      preambles.push(memoryBlock.trim());
    }
  }
  if (searchEnabled && searchProvider === 'brave') {
    preambles.push(TOOL_PREAMBLE);
  }
  if (tutorEnabled) {
    const tutorPreamble = tutorGloballyEnabled ? getTutorPreamble() : '';
    if (tutorPreamble) preambles.push(tutorPreamble);
    try {
      const profile = await loadTutorProfile(chat.id);
      const summary = summarizeTutorProfile(profile);
      if (summary) preambles.push(`Learner Profile:\n${summary}`);
    } catch {
      // ignore profile load failures
    }
    if (ui.nextTutorNudge) {
      preambles.push(`Learner Preference: ${ui.nextTutorNudge.replace(/_/g, ' ')}`);
    }
  }

  const baseSystem = typeof chat.settings.system === 'string' ? chat.settings.system.trim() : '';
  const preambleBlock = preambles.filter(Boolean).join('\n\n');
  let system: string | undefined;
  if (preambleBlock && baseSystem) system = `${preambleBlock}\n\n${baseSystem}`;
  else if (preambleBlock) system = preambleBlock;
  else system = baseSystem || undefined;

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
