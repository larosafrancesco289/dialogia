import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatService } from '@/lib/services/chatService';
import { createChatSlice } from '@/lib/store/chatSlice';
import { useChatStore } from '@/lib/store';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { buildChatExport, importChatExport } from '@/lib/settings/transfer';
import { buildSettingsSavePatch } from '@/components/settings/saveSettings';
import { settingsEqual } from '@/lib/settings/equality';
import type { Chat } from '@/lib/types';

test('createChat uses sticky chat defaults for future chats', async () => {
  const ui = buildDefaultUIState();
  ui.chatDefaults = {
    modelId: 'openai/gpt-4.1-mini',
    system: 'Be terse and direct.',
    generation: {
      temperature: 0.25,
      topP: 0.9,
      maxTokens: 512,
      reasoningEffort: 'low',
      reasoningTokens: 128,
    },
    ui: {
      showThinkingByDefault: true,
      showStats: true,
      showToolCallLog: true,
      showDebugRawJson: false,
    },
    features: {
      search: {
        enabled: true,
        provider: 'openrouter',
      },
    },
  };

  const saved: Chat[] = [];
  const repository = {
    saveChat: async (chat: Chat) => {
      saved.push(chat);
    },
  };

  const chat = await ChatService.createChat({
    ui,
    chats: [],
    selectedChatId: undefined,
    repository: repository as any,
    tier: 'free',
  });

  assert.equal(saved.length, 1);
  assert.equal(chat.settings.modelId, 'openai/gpt-4.1-mini');
  assert.equal(chat.settings.system, 'Be terse and direct.');
  assert.equal(chat.settings.generation.temperature, 0.25);
  assert.equal(chat.settings.generation.reasoningEffort, 'low');
  assert.equal(chat.settings.ui.showThinkingByDefault, true);
  assert.equal(chat.settings.ui.showDebugRawJson, false);
  assert.equal(chat.settings.features.search.enabled, true);
  assert.equal(chat.settings.features.search.provider, 'openrouter');
  assert.notEqual(chat.settings.system, DEFAULT_BASE_SYSTEM);
});

test('newChat reuses the latest empty draft chat instead of creating another blank chat', async () => {
  const draftChat: Chat = {
    id: 'draft-chat',
    title: 'New Chat',
    createdAt: 10,
    updatedAt: 10,
    settings: {
      modelId: 'openai/gpt-4.1-mini',
      system: 'Sticky system',
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: false },
      },
    },
  };

  const activeChat: Chat = {
    ...draftChat,
    id: 'active-chat',
    title: 'Started Chat',
    createdAt: 5,
    updatedAt: 20,
  };

  const state: any = {
    chats: [draftChat, activeChat],
    folders: [],
    messagesById: {
      'user-1': {
        id: 'user-1',
        chatId: 'active-chat',
        role: 'user',
        content: 'Hello',
        createdAt: 20,
      },
    },
    messageIdsByChatId: {
      'active-chat': ['user-1'],
    },
    selectedChatId: 'active-chat',
    ui: buildDefaultUIState({
      chatDefaults: {
        system: 'Fresh sticky system',
      },
    }),
  };

  const set = (partial: any) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    Object.assign(state, next);
  };
  const get = () => state;

  const originalCreateChat = ChatService.createChat;
  const originalUpdateChat = ChatService.updateChat;
  ChatService.createChat = (async () => {
    throw new Error('should not create a second blank draft');
  }) as typeof ChatService.createChat;
  ChatService.updateChat = (async (chat, changes) => ({
    ...chat,
    ...changes,
    updatedAt: 99,
  })) as typeof ChatService.updateChat;

  try {
    const slice = createChatSlice(set as any, get as any);
    await slice.newChat();
  } finally {
    ChatService.createChat = originalCreateChat;
    ChatService.updateChat = originalUpdateChat;
  }

  assert.equal(state.chats.length, 2);
  assert.equal(state.selectedChatId, 'draft-chat');
  assert.equal(state.chats[0].settings.system, 'Fresh sticky system');
});

test('newChat does not reuse a draft that already has messages', async () => {
  const draftChat: Chat = {
    id: 'draft-chat',
    title: 'New Chat',
    createdAt: 10,
    updatedAt: 10,
    settings: {
      modelId: 'openai/gpt-4.1-mini',
      system: 'Sticky system',
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: false },
      },
    },
  };

  const state: any = {
    chats: [draftChat],
    folders: [],
    messagesById: {
      'assistant-1': {
        id: 'assistant-1',
        chatId: 'draft-chat',
        role: 'assistant',
        content: 'Tutor welcome',
        createdAt: 11,
      },
    },
    messageIdsByChatId: {
      'draft-chat': ['assistant-1'],
    },
    selectedChatId: 'draft-chat',
    ui: buildDefaultUIState(),
  };

  const set = (partial: any) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    Object.assign(state, next);
  };
  const get = () => state;

  const originalCreateChat = ChatService.createChat;
  ChatService.createChat = (async () => ({
    ...draftChat,
    id: 'created-chat',
    createdAt: 20,
    updatedAt: 20,
  })) as typeof ChatService.createChat;

  try {
    const slice = createChatSlice(set as any, get as any);
    await slice.newChat();
  } finally {
    ChatService.createChat = originalCreateChat;
  }

  assert.equal(state.selectedChatId, 'created-chat');
  assert.equal(state.chats.length, 2);
});

test('in-chat reasoning changes become sticky for future chats', async () => {
  const activeChat: Chat = {
    id: 'active-chat',
    title: 'Started Chat',
    createdAt: 5,
    updatedAt: 20,
    settings: {
      modelId: 'openai/gpt-5.4',
      system: 'Sticky system',
      generation: {
        reasoningEffort: 'high',
      },
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: false },
      },
    },
  };

  const state: any = {
    chats: [activeChat],
    folders: [],
    messagesById: {},
    messageIdsByChatId: {},
    selectedChatId: 'active-chat',
    ui: buildDefaultUIState(),
  };

  const set = (partial: any) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    Object.assign(state, next);
  };
  const get = () => state;

  const originalUpdateChat = ChatService.updateChat;
  ChatService.updateChat = (async (chat, changes) => ({
    ...chat,
    ...changes,
    updatedAt: 99,
  })) as typeof ChatService.updateChat;

  try {
    const slice = createChatSlice(set as any, get as any);
    await slice.updateChatSettings({
      generation: {
        reasoningEffort: 'xhigh',
      },
    });
  } finally {
    ChatService.updateChat = originalUpdateChat;
  }

  assert.equal(state.chats[0].settings.generation.reasoningEffort, 'xhigh');
  assert.equal(state.ui.chatDefaults?.generation?.reasoningEffort, 'xhigh');

  const nextSettings = ChatService.buildSettingsForNewChat({
    ui: state.ui,
    chats: state.chats,
    selectedChatId: state.selectedChatId,
    tier: 'developer',
  });

  assert.equal(nextSettings.modelId, 'openai/gpt-5.4');
  assert.equal(nextSettings.generation.reasoningEffort, 'xhigh');
});

test('settings drawer patch only touches UI defaults (never the active chat)', () => {
  const patch = buildSettingsSavePatch({
    system: 'Drawer system',
    temperature: 0.4,
    topP: 0.8,
    maxTokens: 2048,
    reasoningEffort: 'medium',
    reasoningTokens: 256,
    showThinking: true,
    showStats: false,
    showToolCallLog: true,
    showDebugRawJson: true,
    tutorDefaultModel: 'anthropic/claude-haiku-4.5',
  });

  assert.ok(patch.uiPatch.chatDefaults, 'uiPatch.chatDefaults should be set');
  assert.equal(patch.uiPatch.chatDefaults?.system, 'Drawer system');
  assert.equal(patch.uiPatch.chatDefaults?.generation?.temperature, 0.4);
  assert.equal(patch.uiPatch.chatDefaults?.ui?.showThinkingByDefault, true);
  assert.equal(patch.uiPatch.tutor?.defaultModelId, 'anthropic/claude-haiku-4.5');
  assert.equal(
    Object.prototype.hasOwnProperty.call(patch, 'chatSettingsPatch'),
    false,
    'legacy chatSettingsPatch must not be emitted',
  );
});

test('settingsEqual distinguishes meaningful field changes', () => {
  const base: Chat['settings'] = {
    modelId: 'openai/gpt-4.1-mini',
    system: 'A',
    generation: { temperature: 0.5 },
    ui: {
      showThinkingByDefault: false,
      showStats: false,
      showToolCallLog: false,
      showDebugRawJson: true,
    },
    features: {
      search: { enabled: false, provider: 'openrouter' },
      tutor: { enabled: false },
    },
    parallelModels: ['a', 'b'],
  };

  assert.equal(settingsEqual(base, { ...base }), true);
  assert.equal(
    settingsEqual(base, { ...base, generation: { temperature: 0.6 } }),
    false,
    'temperature change detected',
  );
  assert.equal(
    settingsEqual(base, { ...base, parallelModels: ['a', 'b'] }),
    true,
    'identical parallel models',
  );
  assert.equal(
    settingsEqual(base, { ...base, parallelModels: ['b', 'a'] }),
    false,
    'parallel model order matters',
  );
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
              provider: 'brave',
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
