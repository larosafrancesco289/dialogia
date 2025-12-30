import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type {
  DraftAttachment,
  PersistedAttachment,
  Chat,
  Message,
  ModelTransport,
} from '@/lib/types';
import type { StoreGetter, StoreSetter, TurnContext } from '@/lib/agent/types';
import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';
import type { ModelCapabilityFlags } from '@/lib/models';
import type { Repository } from '@/lib/db/repository';
import { getCookie } from '@/lib/auth/cookies.client';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { DEFAULT_FREE_TUTOR_MODEL_ID, FREE_MODEL_IDS } from '@/data/freeModels';
import { createMessagePersister } from '@/lib/services/messagePersistence';
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
  attachments: PersistedAttachment[];
};

export type SendRuntime = {
  chatId: string;
  chat: Chat;
  ui: UiSnapshot;
  next: UiNextOverrides;
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
  repository,
}: {
  attachments?: DraftAttachment[];
  set: StoreSetter;
  get: StoreGetter;
  repository: Repository;
}): Promise<SendRuntime | null> => {
  const chatId = get().selectedChatId;
  if (!chatId) return null;
  const initialChat = get().chats.find((c) => c.id === chatId);
  if (!initialChat) return null;
  let chat = initialChat;

  const ui = get().ui;
  const modelIndex = get().modelIndex;
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
        await repository.saveChat(updatedChat);
      } catch {
        /* best effort */
      }
    }
    const preferredTutorModelId =
      ensured.defaultModelId ||
      chat.settings.tutor_default_model ||
      tutorDefaultModelId ||
      DEFAULT_TUTOR_MODEL_ID;
    const tierCookie = getCookie(TIER_COOKIE_NAME);
    const isFreeTier = tierCookie !== 'developer' && tierCookie !== 'individual';
    const freeFallbackFromIndex = modelIndex.all.find((model) =>
      FREE_MODEL_IDS.includes(model.id),
    )?.id;
    let resolvedTutorModelId = preferredTutorModelId;
    if (isFreeTier && resolvedTutorModelId && !FREE_MODEL_IDS.includes(resolvedTutorModelId)) {
      resolvedTutorModelId = freeFallbackFromIndex ?? DEFAULT_FREE_TUTOR_MODEL_ID;
    }
    if (
      modelIndex.all.length > 0 &&
      resolvedTutorModelId &&
      !modelIndex.get(resolvedTutorModelId)
    ) {
      resolvedTutorModelId =
        (isFreeTier ? freeFallbackFromIndex : undefined) ??
        modelIndex.all[0]?.id ??
        resolvedTutorModelId;
    }
    tutorDefaultModelId = resolvedTutorModelId;
    if (
      resolvedTutorModelId &&
      (chat.settings.model !== resolvedTutorModelId ||
        chat.settings.tutor_default_model !== resolvedTutorModelId)
    ) {
      const updatedChat: Chat = {
        ...chat,
        settings: {
          ...chat.settings,
          model: resolvedTutorModelId,
          tutor_default_model: resolvedTutorModelId,
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
    get,
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

  const persistMessage = createMessagePersister(repository);
  const baseTurnContext: Omit<TurnContext, 'apiKey' | 'transport'> = {
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
