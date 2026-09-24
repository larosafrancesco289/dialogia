import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@/lib/db';
import { ChatService } from '@/lib/services/chatService';
import { useChatStore } from '@/lib/store';
import { buildMessageIndex } from '@/lib/messages/indexing';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { buildChatExport, importChatExport } from '@/lib/settings/transfer';
import { buildSettingsSavePatch } from '@/components/settings/saveSettings';
import { settingsEqual } from '@/lib/settings/equality';
import type { Chat, ChatDefaults, Message } from '@/lib/types';
import { createTestStore } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';

/** A store over the in-memory database, holding these chats with the first one open. */
function storeWith(chats: Chat[], messages: Message[] = [], chatDefaults?: ChatDefaults) {
  const store = createTestStore();
  const byChat: Record<string, Message[]> = {};
  for (const chat of chats) byChat[chat.id] = messages.filter((m) => m.chatId === chat.id);
  store.setState((s) => ({
    chats,
    selectedChatId: chats[0]?.id,
    ...buildMessageIndex(byChat),
    loadedMessageChatIds: Object.fromEntries(chats.map((c) => [c.id, true as const])),
    ui: { ...s.ui, chatDefaults },
  }));
  return store;
}

const activeChat = (id: string, generation: Chat['settings']['generation'] = {}) =>
  makeChat({
    id,
    title: 'Started Chat',
    createdAt: 5,
    updatedAt: 20,
    settings: { modelId: 'openai/gpt-5.4', system: 'Sticky system', generation },
  });

const draft = (id: string) =>
  makeChat({
    id,
    title: 'New Chat',
    createdAt: 10,
    updatedAt: 10,
    settings: { modelId: 'openai/gpt-4.1-mini', system: 'Sticky system' },
  });

const newChatSettings = (store: ReturnType<typeof createTestStore>) => {
  const { ui, chats, selectedChatId } = store.getState();
  return ChatService.buildSettingsForNewChat({ ui, chats, selectedChatId });
};

test('newChat uses sticky chat defaults and saves the chat', async () => {
  const store = storeWith([], [], {
    modelId: 'openai/gpt-4.1-mini',
    system: 'Be terse and direct.',
    generation: { maxTokens: 512, reasoningEffort: 'low', reasoningTokens: 128 },
    ui: {
      showThinkingByDefault: true,
      showStats: true,
      showToolCallLog: true,
      showDebugRawJson: false,
    },
    features: { search: { enabled: true, provider: 'openrouter' } },
  });

  await store.getState().newChat();

  const { chats, selectedChatId } = store.getState();
  assert.equal(chats.length, 1);
  const chat = chats[0];
  assert.equal(selectedChatId, chat.id);
  assert.deepEqual(await db.chats.get(chat.id), chat);
  assert.equal(chat.settings.modelId, 'openai/gpt-4.1-mini');
  assert.equal(chat.settings.system, 'Be terse and direct.');
  assert.equal(chat.settings.generation.temperature, undefined);
  assert.equal(chat.settings.generation.topP, undefined);
  assert.equal(chat.settings.generation.maxTokens, 512);
  assert.equal(chat.settings.generation.reasoningEffort, 'low');
  assert.equal(chat.settings.ui.showThinkingByDefault, true);
  assert.equal(chat.settings.ui.showDebugRawJson, false);
  assert.equal(chat.settings.features.search.enabled, true);
  assert.equal(chat.settings.features.search.provider, 'openrouter');
});

test('newChat reuses the latest empty draft chat instead of creating another blank chat', async () => {
  const started = activeChat('reuse-active');
  const store = storeWith(
    [draft('reuse-draft'), started],
    [createUserMessage({ id: 'reuse-user', chatId: started.id, content: 'Hello', createdAt: 20 })],
    { system: 'Fresh sticky system' },
  );
  store.setState({ selectedChatId: started.id });

  await store.getState().newChat();

  const { chats, selectedChatId } = store.getState();
  assert.deepEqual(
    chats.map((c) => c.id),
    ['reuse-draft', 'reuse-active'],
  );
  assert.equal(selectedChatId, 'reuse-draft');
  // The draft took the current defaults, in the store and in the database.
  assert.equal(chats[0].settings.system, 'Fresh sticky system');
  assert.equal((await db.chats.get('reuse-draft'))?.settings.system, 'Fresh sticky system');
});

test('newChat does not reuse a draft that already has messages', async () => {
  const store = storeWith(
    [draft('welcomed-draft')],
    [
      createAssistantMessage({
        id: 'welcome',
        chatId: 'welcomed-draft',
        content: 'Tutor welcome',
        createdAt: 11,
      }),
    ],
  );

  await store.getState().newChat();

  const { chats, selectedChatId } = store.getState();
  assert.equal(chats.length, 2);
  assert.notEqual(selectedChatId, 'welcomed-draft');
  assert.equal(chats[0].id, selectedChatId);
});

test('in-chat reasoning changes become sticky for future chats', async () => {
  const store = storeWith([activeChat('reasoning-chat', { reasoningEffort: 'high' })]);

  await store.getState().updateChatSettings({ generation: { reasoningEffort: 'xhigh' } });

  const state = store.getState();
  assert.equal(state.chats[0].settings.generation.reasoningEffort, 'xhigh');
  assert.equal(
    (await db.chats.get('reasoning-chat'))?.settings.generation.reasoningEffort,
    'xhigh',
  );
  assert.equal(state.ui.chatDefaults?.generation?.reasoningEffort, 'xhigh');

  const next = newChatSettings(store);
  assert.equal(next.modelId, 'openai/gpt-5.4');
  assert.equal(next.generation.reasoningEffort, 'xhigh');
});

test('switching model resets reasoning to the new model default', async () => {
  const store = storeWith(
    [activeChat('switch-chat', { reasoningEffort: 'xhigh', reasoningTokens: 4096 })],
    [],
    { generation: { reasoningEffort: 'xhigh', reasoningTokens: 4096 } },
  );

  await store.getState().updateChatSettings({ modelId: 'anthropic/claude-fable-5' });

  const state = store.getState();
  assert.equal(state.chats[0].settings.modelId, 'anthropic/claude-fable-5');
  assert.equal(state.chats[0].settings.generation.reasoningEffort, undefined);
  assert.equal(state.chats[0].settings.generation.reasoningTokens, undefined);
  // The sticky default resets alongside so future chats follow the model.
  assert.equal(state.ui.chatDefaults?.generation?.reasoningEffort, undefined);
  assert.equal(state.ui.chatDefaults?.generation?.reasoningTokens, undefined);
});

test('in-chat model changes become sticky for future chats; search does not', async () => {
  const store = storeWith([activeChat('model-chat')], [], {
    modelId: 'anthropic/claude-opus-4.7',
  });

  await store.getState().updateChatSettings({ modelId: 'x-ai/grok-4' });
  await store.getState().updateChatSettings({ features: { search: { enabled: true } } });

  const state = store.getState();
  assert.equal(state.ui.chatDefaults?.modelId, 'x-ai/grok-4');
  assert.equal(state.ui.chatDefaults?.features?.search?.enabled, undefined);
  assert.equal(state.chats[0].settings.features.search.enabled, true);
  // A settings change is not activity: the chat keeps its place in the list.
  assert.equal(state.chats[0].updatedAt, 20);

  const next = newChatSettings(store);
  assert.equal(next.modelId, 'x-ai/grok-4');
  assert.equal(next.features.search.enabled, false);
});

test('settings drawer patch only touches UI defaults (never the active chat)', () => {
  const patch = buildSettingsSavePatch({
    system: 'Drawer system',
    reasoningEffort: 'medium',
    reasoningTokens: 256,
    showThinking: true,
    showStats: false,
    showToolCallLog: true,
    showDebugRawJson: true,
  });

  assert.ok(patch.uiPatch.chatDefaults, 'uiPatch.chatDefaults should be set');
  assert.equal(patch.uiPatch.chatDefaults?.system, 'Drawer system');
  assert.equal(patch.uiPatch.chatDefaults?.generation?.reasoningEffort, 'medium');
  assert.equal(patch.uiPatch.chatDefaults?.ui?.showThinkingByDefault, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(patch, 'chatSettingsPatch'),
    false,
    'legacy chatSettingsPatch must not be emitted',
  );
});

test('settingsEqual distinguishes meaningful field changes', () => {
  const base = makeChat({
    settings: {
      system: 'A',
      generation: { temperature: 0.5 },
      features: { tutor: { enabled: false } },
    },
  }).settings;

  assert.equal(settingsEqual(base, { ...base }), true);
  assert.equal(
    settingsEqual(base, { ...base, generation: { temperature: 0.6 } }),
    false,
    'temperature change detected',
  );
  assert.equal(settingsEqual(base, { ...base, system: 'B' }), false, 'system change detected');
  assert.equal(
    settingsEqual(base, {
      ...base,
      features: {
        ...base.features,
        tutor: { ...base.features.tutor, enabled: true },
      },
    }),
    false,
    'tutor toggle detected',
  );
});

test('chat export and import preserve sticky chat defaults', async () => {
  const originalState = useChatStore.getState();
  const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  const storage = new Map<string, string>();
  const persistApi = (useChatStore as any).persist;
  const originalPersistOptions = persistApi?.getOptions?.();

  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  };

  persistApi?.setOptions?.({
    ...originalPersistOptions,
    storage: {
      getItem: (name: string) => {
        const raw = storage.get(name);
        return raw ? JSON.parse(raw) : null;
      },
      setItem: (name: string, value: unknown) => {
        storage.set(name, JSON.stringify(value));
      },
      removeItem: (name: string) => {
        storage.delete(name);
      },
    },
  });

  try {
    useChatStore.setState({
      ...originalState,
      ui: {
        ...originalState.ui,
        chatDefaults: {
          system: 'Exported sticky system',
          features: {
            search: {
              provider: 'tavily',
            },
          },
        },
      },
    });

    const exported = await buildChatExport();
    assert.equal(exported.ok, true);
    const parsed = JSON.parse(exported.json);
    assert.equal(parsed.persistedStore.ui.chatDefaults.system, 'Exported sticky system');

    useChatStore.setState({
      ...useChatStore.getState(),
      ui: {
        ...useChatStore.getState().ui,
        chatDefaults: undefined,
      },
    });

    const imported = await importChatExport(
      JSON.stringify({
        chats: [],
        messages: [],
        folders: [],
        persistedStore: parsed.persistedStore,
      }),
    );

    assert.equal(imported.ok, true);
    assert.equal(useChatStore.getState().ui.chatDefaults?.system, 'Exported sticky system');
    assert.match(storage.get('dialogia-ui') ?? '', /Exported sticky system/);
  } finally {
    useChatStore.setState(originalState);
    persistApi?.setOptions?.(originalPersistOptions);
    if (originalLocalStorage === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
    }
  }
});
