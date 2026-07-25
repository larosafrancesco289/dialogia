// Module: agent/compose
// Responsibility: Build per-turn request payload pieces (system, messages, tools, plugins, routing)
// by inspecting chat state, UI preferences, and prepared attachments.

import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import { composePlugins } from '@/lib/agent/request';
import { getSearchToolDefinition } from '@/lib/search';
import { type ComposeTurnArgs, type TurnComposition, type ToolDefinition } from '@/lib/agent/types';
import { combineSystem } from '@/lib/agent/system';
import { ENABLED_MODULES } from '@/lib/modules';
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
  const searchEnabled = settings.searchEnabled;

  const searchProvider = settings.searchProvider || 'openrouter';

  const priorMessages = prior ?? [];
  const preparedAttachments = attachments ?? newUser?.attachments ?? [];
  const hadPdfEarlier = priorMessages.some(
    (m) => Array.isArray(m.attachments) && m.attachments.some((att) => att.kind === 'pdf'),
  );
  const hasPdf = preparedAttachments.some((att) => att.kind === 'pdf') || hadPdfEarlier;

  const plugins = composePlugins({ hasPdf, searchEnabled, searchProvider });

  // Collect preambles split into stable (cacheable) and dynamic (per-turn) groups.
  // Stable: tool preamble plus whatever the modules contribute.
  // Dynamic: per-turn module context (e.g. mastery scores that change each turn).
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

  const searchTools: ToolDefinition[] =
    searchEnabled && searchProvider === 'tavily' ? getSearchToolDefinition() : [];
  const moduleTools: ToolDefinition[] = [];
  let modulesRequirePlanning = false;
  let modulesReplaceBaseSystem = false;
  for (const appModule of ENABLED_MODULES) {
    const contribution = await appModule.compose?.({
      chat,
      ui,
      settings,
      priorMessages: priorMessages as Message[],
    });
    if (!contribution) continue;
    if (contribution.tools?.length) moduleTools.push(...contribution.tools);
    if (contribution.stablePreambles?.length) stablePreambles.push(...contribution.stablePreambles);
    if (contribution.dynamicPreambles?.length)
      dynamicPreambles.push(...contribution.dynamicPreambles);
    if (contribution.requiresPlanning) modulesRequirePlanning = true;
    if (contribution.replacesBaseSystem) modulesReplaceBaseSystem = true;
  }
  const tools = [...searchTools, ...moduleTools];

  const baseSystem =
    !modulesReplaceBaseSystem && typeof settings.system === 'string' ? settings.system : undefined;
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

  const shouldPlan = modulesRequirePlanning || (searchEnabled && searchProvider === 'tavily');

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
    consumedTutorNudge: settings.tutorEnabled ? settings.tutorNudge : undefined,
  };
}
