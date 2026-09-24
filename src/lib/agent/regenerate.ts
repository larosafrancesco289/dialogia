// Module: agent/regenerate
// Responsibility: Support regeneration of assistant messages with preserved settings.
// A reply in a chat whose composition asks for the agent loop is regenerated as a whole
// turn instead (fresh composition, tools, agent loop), so a card comes back as a card.

import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import { composePlugins } from '@/lib/agent/request';
import type { Chat, Message } from '@/lib/types';
import type { ModelMessage, RegenerateOptions } from '@/lib/agent/types';
import { resolveRegenerationSettings } from '@/lib/agent/regenerateSettings';
import { streamFinal } from '@/lib/agent/streaming';
import { setTurnController } from '@/lib/turns/runtime';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { adjustActiveTurnCount } from '@/lib/ui/streaming';
import { composeTurn } from '@/lib/agent/compose';
import { createTurnLifecycle } from '@/lib/agent/orchestrator/lifecycle';
import { runTurn } from '@/lib/agent/orchestrator/turn';
import { updateMessageById } from '@/lib/messages/updateMessageById';

export async function regenerate(opts: RegenerateOptions): Promise<void> {
  const { chat, chatId, targetMessageId, messages, turn, controller, overrideModelId, pipeline } =
    opts;
  const { models, modelIndex, set } = turn;

  const index = messages.findIndex((msg) => msg.id === targetMessageId);
  if (index < 0) return;

  const original = messages[index];
  const priorMessages = messages.slice(0, index);
  const payload = buildChatCompletionMessages({
    chat,
    priorMessages,
    models,
    timestamps: turn.get().ui.messageTimestamps === true,
  });
  const systemSnapshot = original.systemSnapshot;
  const convo: ModelMessage[] = systemSnapshot
    ? [
        { role: 'system', content: systemSnapshot },
        ...payload.filter((entry) => entry.role !== 'system'),
      ]
    : payload;

  const hadPdfEarlier = priorMessages.some(
    (msg) => Array.isArray(msg.attachments) && msg.attachments.some((att) => att.kind === 'pdf'),
  );

  const modelIdForTurn = overrideModelId || chat.settings.modelId;
  const caps = modelIndex.caps(modelIdForTurn);

  const { genSettings, chatSettings, providerSort } = resolveRegenerationSettings({
    original,
    settings: chat.settings,
    modelId: modelIdForTurn,
    supportsReasoning: caps.canReason,
  });

  const replacement = createAssistantMessage({
    id: original.id,
    chatId,
    content: '',
    createdAt: original.createdAt,
    model: modelIdForTurn,
    attachments: [],
    systemSnapshot,
    genSettings,
  });

  // Until the new reply shows something, the old one stays on disk: a failed
  // or stopped attempt must not save its empty cut-off copy over the original.
  const persistMessage: typeof turn.persistMessage = (message) =>
    message.id === original.id && message.cutOff && !hasOutput(message)
      ? Promise.resolve()
      : turn.persistMessage(message);
  const regenTurn = { ...turn, persistMessage };

  const chatForStream: Chat = { ...chat, settings: chatSettings };

  const uiSnapshot = turn.get().ui;
  const settings = resolveTurnSettings({
    chat: chatForStream,
    ui: { ...uiSnapshot, overrides: undefined },
    modelIndex,
    modelId: modelIdForTurn,
  });
  settings.generation.providerSort = providerSort;

  // Built after `resolveTurnSettings`, never before: that is where a tool-based
  // search provider with no key on this machine degrades to provider-native
  // search, and native search is exactly what needs the `web` plugin.
  const plugins = composePlugins({
    hasPdf: hadPdfEarlier,
    searchEnabled: settings.searchEnabled,
    searchProvider: settings.searchProvider,
  });

  // Counted in only here, right before the try whose finally counts it out.
  set((state) => ({
    messagesById: {
      ...state.messagesById,
      [original.id]: replacement,
    },
    ui: adjustActiveTurnCount(state.ui, chatId, 1),
  }));
  setTurnController(chatId, controller);

  try {
    // Composed from today's state, after any module has let go of what the old
    // reply recorded. A module that runs its turns as an agent loop gets one
    // here too; every other chat regenerates exactly as before, from the snapshot.
    const composition = await composeTurn({
      chat: chatForStream,
      ui: { ...uiSnapshot, overrides: undefined },
      settings,
      modelIndex,
      prior: priorMessages,
      store: { set, get: turn.get },
    });
    if (composition.loop === 'agent') {
      const lastUser = [...priorMessages].reverse().find((msg) => msg.role === 'user');
      const lifecycle = createTurnLifecycle({
        chatId,
        assistantMessageId: replacement.id,
        isPrimary: true,
        priorMessages,
        getChatForTurn: () => chatForStream,
        set,
        get: turn.get,
        updateMessage: (patch) =>
          set(
            (state) =>
              updateMessageById(state, chatId, replacement.id, (msg) => ({ ...msg, ...patch })) ??
              state,
          ),
      });
      const { auth: _auth, ...baseTurnContext } = regenTurn;
      await runTurn({
        chat: chatForStream,
        chatId,
        modelId: modelIdForTurn,
        userContent: lastUser?.content ?? '',
        assistantMessage: replacement,
        priorMessages,
        ui: uiSnapshot,
        settings,
        controller,
        baseTurnContext,
        compose: async () => composition,
        streamFinal: (options) => streamFinal({ ...options, pipeline }),
        authResolver: () => turn.auth,
        hooks: lifecycle.hooks,
        pipeline,
      });
      return;
    }

    await streamFinal({
      chat: chatForStream,
      chatId,
      assistantMessage: replacement,
      messages: convo,
      controller,
      turn: regenTurn,
      settings,
      plugins,
      toolDefinition: undefined,
      pipeline,
    });
  } catch (error) {
    // Nothing of the new reply arrived, so the original comes back on screen.
    set((state) => {
      const current = state.messagesById[original.id];
      if (!current || hasOutput(current)) return {};
      return { messagesById: { ...state.messagesById, [original.id]: original } };
    });
    throw error;
  } finally {
    set((state) => ({
      ui: adjustActiveTurnCount(state.ui, chatId, -1),
    }));
  }
}

const hasOutput = (message: Message): boolean =>
  !!message.content?.trim() ||
  !!message.reasoning?.trim() ||
  !!message.toolCalls?.length ||
  !!message.attachments?.length;
