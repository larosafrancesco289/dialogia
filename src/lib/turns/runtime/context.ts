// Module: turns/runtime
// Responsibility: Assemble per-turn runtime context (models, auth, attachments) for chat sends.

import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type { DraftAttachment, PersistedAttachment, Chat, Message } from '@/lib/types';
import type { StoreGetter, StoreSetter, TurnContext } from '@/lib/agent/types';
import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';
import type { ModelCapabilityFlags } from '@/lib/models';
import { resolveDynamicModelId } from '@/lib/models';
import type { Repository } from '@/lib/db/repository';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { applyModuleSettingsDefaults } from '@/lib/settings/moduleDefaults';
import { createModelAuthResolver, type ModelAuth } from '@/lib/services/auth';
import { prepareAttachmentsByModel } from '@/lib/attachments/prepare';
import { describeDroppedAttachments } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';
import { readNextOverrides } from '@/lib/ui/next';
import { isTutorRuntimeEnabled, selectTutorDefaultModelId } from '@/lib/policy/runtime';
import { getMessagesForChat } from '@/lib/messages/indexing';

export type TurnModelContext = {
  modelId: string;
  auth: ModelAuth;
  caps: ModelCapabilityFlags;
  attachments: PersistedAttachment[];
};

export type TurnRuntimeContext = {
  chatId: string;
  chat: Chat;
  ui: UiSnapshot;
  next: UiNextOverrides;
  tutorEnabled: boolean;
  activeModelIds: string[];
  primaryModelId?: string;
  priorMessages: Message[];
  baseTurnContext: Omit<TurnContext, 'auth'>;
  modelContexts: Map<string, TurnModelContext>;
};

export const prepareSendRuntime = async ({
  attachments,
  set,
  get,
  repository,
}: {
  attachments?: DraftAttachment[];
  set: StoreSetter;
  get: StoreGetter;
  repository: Repository;
}): Promise<TurnRuntimeContext | null> => {
  const chatId = get().selectedChatId;
  if (!chatId) return null;
  const initialChat = get().chats.find((c) => c.id === chatId);
  if (!initialChat) return null;
  let chat = initialChat;

  const ui = get().ui;
  const modelIndex = get().modelIndex;
  const next = readNextOverrides(ui);
  const tutorEnabled = isTutorRuntimeEnabled(ui, chat);
  let tutorDefaultModelId = resolveDynamicModelId(
    selectTutorDefaultModelId(ui, chat, DEFAULT_TUTOR_MODEL_ID) ?? DEFAULT_TUTOR_MODEL_ID,
    modelIndex.all,
  );

  if (tutorEnabled) {
    const ensured = applyModuleSettingsDefaults({ chat, ui });
    if (ensured.changed) {
      const updatedChat: Chat = { ...chat, settings: ensured.nextSettings, updatedAt: Date.now() };
      set((state) => ({ chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
      chat = updatedChat;
      try {
        await repository.saveChat(updatedChat);
      } catch {
        /* best effort */
      }
    }
    const preferredTutorModelId =
      ensured.preferredModelId ||
      chat.settings.features.tutor?.defaultModelId ||
      tutorDefaultModelId ||
      DEFAULT_TUTOR_MODEL_ID;
    let resolvedTutorModelId = preferredTutorModelId;
    // A tutor model that is no longer in the catalogue falls back to whatever
    // loaded first rather than sending a request that cannot succeed.
    if (
      modelIndex.all.length > 0 &&
      resolvedTutorModelId &&
      !modelIndex.get(resolvedTutorModelId)
    ) {
      resolvedTutorModelId = modelIndex.all[0]?.id ?? resolvedTutorModelId;
    }
    tutorDefaultModelId = resolvedTutorModelId;
    if (
      resolvedTutorModelId &&
      (chat.settings.modelId !== resolvedTutorModelId ||
        chat.settings.features.tutor?.defaultModelId !== resolvedTutorModelId)
    ) {
      const updatedChat: Chat = {
        ...chat,
        settings: {
          ...chat.settings,
          modelId: resolvedTutorModelId,
          features: {
            ...chat.settings.features,
            tutor: {
              ...chat.settings.features.tutor,
              defaultModelId: resolvedTutorModelId,
            },
          },
        },
        updatedAt: Date.now(),
      };
      set((state) => ({ chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
      chat = updatedChat;
      try {
        await repository.saveChat(updatedChat);
      } catch {
        /* best effort */
      }
    }
  }

  const activeModelIds = chat.settings.modelId ? [chat.settings.modelId] : [];

  const modelAuthResolver = createModelAuthResolver({
    modelIndex: get().modelIndex,
    set,
    get,
  });
  const modelsNeedingAuth = new Set<string>(activeModelIds);
  if (tutorEnabled && tutorDefaultModelId) {
    modelsNeedingAuth.add(tutorDefaultModelId);
  }
  if (!modelAuthResolver.ensureAll(modelsNeedingAuth)) {
    return null;
  }

  const prepared = await prepareAttachmentsByModel({
    attachments,
    modelIds: activeModelIds,
    models: get().models,
  });
  // Dropping an attachment the model cannot read used to be silent, which read
  // as the model ignoring the file.
  if (prepared.droppedKinds.length > 0) {
    notify(get, describeDroppedAttachments(prepared.droppedKinds));
  }

  const persistMessage = createMessagePersister(repository);
  const baseTurnContext: Omit<TurnContext, 'auth'> = {
    set,
    get,
    models: get().models,
    modelIndex: get().modelIndex,
    persistMessage,
  };

  const modelContexts = new Map<string, TurnModelContext>();
  for (const modelId of activeModelIds) {
    const auth = modelAuthResolver.get(modelId);
    if (!auth) continue;
    modelContexts.set(modelId, {
      modelId,
      auth,
      caps: get().modelIndex.caps(modelId),
      attachments: prepared.byModel.get(modelId) ?? [],
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
    priorMessages: getMessagesForChat(get(), chatId),
    baseTurnContext,
    modelContexts,
  };
};
