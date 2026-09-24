// Module: tutor tooling store
// Responsibility: the app's store, built from the real slices, for one headless tutor chat.

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import type { createModelIndex } from '@/lib/models';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import type { Chat, ModelDescriptor } from '@/lib/types';
import { buildDefaultUIState } from '@/lib/ui/defaults';

export type HeadlessStoreOptions = {
  chat: Chat;
  models: ModelDescriptor[];
  modelIndex: ReturnType<typeof createModelIndex>;
};

/**
 * Builds the store from the real slices, with tutor mode on for the one chat.
 * Only the actions that would reach the network on their own (bootstrap, the
 * model list, the composer's send) are stubbed: the session drives turns itself.
 * Persistence is the in-memory database `@/lib/db` picks outside a browser.
 */
export function createHeadlessStore(options: HeadlessStoreOptions): StoreApi<StoreState> {
  const { chat, models, modelIndex } = options;
  const initializer = buildStoreInitializer() as unknown as StateCreator<StoreState>;

  return createStore<StoreState>((set, get, store) => {
    const base = initializer(set, get, store);
    const noop = async () => {};
    return {
      ...base,
      chats: [chat],
      selectedChatId: chat.id,
      loadedMessageChatIds: { [chat.id]: true as const },
      models,
      modelIndex,
      ui: buildDefaultUIState({
        flags: { experimentalTutor: true },
        tutor: { forceMode: true },
      }),
      initializeApp: noop,
      loadModels: noop,
      sendUserMessage: noop,
      regenerateAssistantMessage: noop,
    };
  });
}
