import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type { Attachment, Chat, Message, ModelTransport } from '@/lib/types';
import type { StoreGetter, StoreSetter, TurnContext } from '@/lib/agent/types';
import type { UIState, UINextOverrides } from '@/lib/store/types';
import type { ModelCapabilityFlags } from '@/lib/models';
import { saveChat, saveMessage } from '@/lib/db';
import { ensureTutorDefaults } from '@/lib/agent/tutorFlow';
import { createModelAuthResolver, type ModelAuth } from '@/lib/services/auth';
import { prepareAttachmentsByModel } from '@/lib/services/attachments';
import { normalizeParallelModels } from '@/lib/store/normalize';
import { readNextOverrides } from '@/lib/ui/next';
import { isTutorRuntimeEnabled, selectTutorDefaultModelId } from '@/lib/policy/runtime';

export type TurnModelContext = {
  modelId: string;
  auth: ModelAuth & { transport: ModelTransport };
  caps: ModelCapabilityFlags;
  attachments: Attachment[];
};

export type SendRuntime = {
  chatId: string;
  chat: Chat;
  ui: UIState;
  next: UINextOverrides;
  tutorEnabled: boolean;
  activeModelIds: string[];
  primaryModelId?: string;
  priorMessages: Message[];
  baseTurnContext: Omit<TurnContext, 'apiKey' | 'transport'>;
  modelContexts: Map<string, TurnModelContext>;
};

export const prepareSendRuntime = async ({
  attachments,
  set,
  get,
}: {
  attachments?: Attachment[];
  set: StoreSetter;
  get: StoreGetter;
}): Promise<SendRuntime | null> => {
  const chatId = get().selectedChatId;
  if (!chatId) return null;
  const initialChat = get().chats.find((c) => c.id === chatId);
  if (!initialChat) return null;
  let chat = initialChat;

  const ui = get().ui;
  const next = readNextOverrides(ui);
  const tutorEnabled = isTutorRuntimeEnabled(ui, chat);
  let tutorDefaultModelId = selectTutorDefaultModelId(ui, chat, DEFAULT_TUTOR_MODEL_ID);

  if (tutorEnabled) {
    const ensured = ensureTutorDefaults({
      ui,
      chat,
      fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    });
    if (ensured.changed) {
      const updatedChat: Chat = { ...chat, settings: ensured.nextSettings, updatedAt: Date.now() };
      set((state) => ({ chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
      chat = updatedChat;
      try {
        await saveChat(updatedChat);
      } catch {
        /* best effort */
      }
    }
    tutorDefaultModelId =
      ensured.defaultModelId ||
      chat.settings.tutor_default_model ||
      tutorDefaultModelId ||
      DEFAULT_TUTOR_MODEL_ID;
  }

  const parallelModels = normalizeParallelModels(
    chat.settings.model,
    chat.settings.parallel_models,
  );
  const activeModelIds = Array.from(
    new Set(
      [chat.settings.model, ...parallelModels].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  );
  if (!activeModelIds.length && chat.settings.model) activeModelIds.push(chat.settings.model);

  const modelAuthResolver = createModelAuthResolver({
    modelIndex: get().modelIndex,
    set,
  });
  const modelsNeedingAuth = new Set<string>(activeModelIds);
  if (tutorEnabled && tutorDefaultModelId) {
    modelsNeedingAuth.add(tutorDefaultModelId);
  }
  if (!modelAuthResolver.ensureAll(modelsNeedingAuth)) {
    return null;
  }

  const attachmentsByModel = await prepareAttachmentsByModel({
    attachments,
    modelIds: activeModelIds,
    models: get().models,
  });

  const baseTurnContext: Omit<TurnContext, 'apiKey' | 'transport'> = {
    set,
    get,
    models: get().models,
    modelIndex: get().modelIndex,
    persistMessage: saveMessage,
  };

  const modelContexts = new Map<string, TurnModelContext>();
  for (const modelId of activeModelIds) {
    const auth = modelAuthResolver.get(modelId);
    if (!auth) continue;
    modelContexts.set(modelId, {
      modelId,
      auth,
      caps: get().modelIndex.caps(modelId),
      attachments: attachmentsByModel.get(modelId) ?? [],
    });
  }

  return {
    chatId,
    chat,
    ui,
    next,
    tutorEnabled,
    activeModelIds,
    primaryModelId: activeModelIds[0],
    priorMessages: get().messages[chatId] ?? [],
    baseTurnContext,
    modelContexts,
  };
};
