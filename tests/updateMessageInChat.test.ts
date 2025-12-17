import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { updateMessageInChat } from '@/lib/store/messageUtils';
import { buildDefaultVoiceState } from '@/lib/voice/types';

const noop = () => undefined;
const noopAsync = async () => undefined;

const baseState = (messages: Record<string, Message[]>): StoreState =>
  ({
    chats: [],
    folders: [],
    messages,
    models: [],
    modelIndex: {
      all: [],
      byId: new Map(),
      get: () => undefined,
      caps: () => ({ canReason: false, canSee: false, canAudio: false, canImageOut: false }),
      label: () => '',
    },
    favoriteModelIds: [],
    hiddenModelIds: [],
    ui: {} as StoreState['ui'],
    voice: buildDefaultVoiceState(),
    initializeApp: noopAsync,
    newChat: noopAsync,
    selectChat: noop,
    renameChat: noopAsync,
    deleteChat: noopAsync,
    updateChatSettings: noopAsync,
    moveChatToFolder: noopAsync,
    createFolder: noopAsync,
    renameFolder: noopAsync,
    deleteFolder: noopAsync,
    toggleFolderExpanded: noopAsync,
    setUI: noop,
    logTutorResult: noopAsync,
    loadTutorProfileIntoUI: noopAsync,
    primeTutorWelcomePreview: async () => undefined,
    prepareTutorWelcomeMessage: async () => undefined,
    applyLearnerModelFeedbackFromUser: noopAsync,
    loadModels: noopAsync,
    toggleFavoriteModel: noop,
    hideModel: noop,
    unhideModel: noop,
    resetHiddenModels: noop,
    removeModelFromDropdown: noop,
    sendUserMessage: noopAsync,
    branchChatFromMessage: noopAsync,
    stopStreaming: noop,
    regenerateAssistantMessage: noopAsync,
    editUserMessage: noopAsync,
    editAssistantMessage: noopAsync,
    appendAssistantMessage: noopAsync,
    persistTutorStateForMessage: noopAsync,
    // Voice actions (no-ops for tests)
    setVoiceActive: noop,
    setVoiceConnected: noop,
    setVoiceListening: noop,
    setVoiceSpeaking: noop,
    setVoiceError: noop,
    setVoiceConfig: noop,
    resetVoiceState: noop,
    ensureChatForVoice: async () => 'chat-1',
    addVoiceUserMessage: noopAsync,
    addVoiceAssistantMessage: noopAsync,
  }) as StoreState;

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  chatId: 'chat-1',
  role: 'assistant',
  content: 'Hello',
  createdAt: Date.now(),
  toolCalls: [],
  ...overrides,
});

test('updateMessageInChat merges patches immutably', () => {
  const original = createMessage({ attachments: [] });
  const state = baseState({ 'chat-1': [original] });
  const patch: Partial<Message> = {
    attachments: [
      {
        id: 'att-1',
        kind: 'image',
        name: 'diagram.png',
        mime: 'image/png',
        size: 1234,
        dataURL: 'data:image/png;base64,xyz',
      },
    ],
    metrics: {
      completionMs: 1200,
      promptTokens: 32,
      completionTokens: 64,
      tokensPerSec: 12.5,
      ttftMs: 180,
    },
  };
  const result = updateMessageInChat(state, 'chat-1', original.id, patch);

  const updated = result.messages?.['chat-1']?.[0] as Message;
  assert.ok(updated);
  assert.equal(updated.attachments?.length, 1);
  assert.equal(updated.metrics?.completionMs, 1200);
  assert.equal(updated.metrics?.promptTokens, 32);
  assert.equal(state.messages['chat-1'][0].attachments?.length, 0);
});

test('updateMessageInChat returns empty patch when chat or message missing', () => {
  const state = baseState({ 'chat-1': [createMessage()] });
  const missingChat = updateMessageInChat(state, 'chat-x', 'm1', { content: 'noop' });
  assert.deepEqual(missingChat, {});
  const missingMessage = updateMessageInChat(state, 'chat-1', 'missing', { content: 'noop' });
  assert.deepEqual(missingMessage, {});
});
