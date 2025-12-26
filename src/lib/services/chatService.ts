import { v4 as uuidv4 } from 'uuid';
import {
  deleteChatAndMessages,
  deleteFolder,
  saveChat,
  saveChatWithMessages,
  saveFolder,
  saveMessage,
} from '@/lib/db';
import type { Chat, Folder, Message } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/policy';
import { deriveChatSettingsFromUi } from '@/lib/store/chatSettings';
import { DEFAULT_FREE_MODEL_ID } from '@/data/freeModels';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';

// Read tier from cookie on client side
function getClientTier(): 'free' | 'individual' | 'developer' {
  if (typeof document === 'undefined') return 'free';
  const match = document.cookie.match(new RegExp('(^| )' + TIER_COOKIE_NAME + '=([^;]+)'));
  const tier = match ? decodeURIComponent(match[2]) : null;
  if (tier === 'developer' || tier === 'individual' || tier === 'free') {
    return tier;
  }
  return 'free';
}

// Get the appropriate default model based on tier
function getTierDefaultModelId(): string {
  const tier = getClientTier();
  return tier === 'free' ? DEFAULT_FREE_MODEL_ID : DEFAULT_MODEL_ID;
}

export class ChatService {
  static async createChat(params: {
    ui: UIState;
    chats: Chat[];
    selectedChatId?: string;
  }): Promise<Chat> {
    const { ui, chats, selectedChatId } = params;
    const id = uuidv4();
    const now = Date.now();

    const selected = selectedChatId ? chats.find((c) => c.id === selectedChatId) : undefined;

    const lastNonTutorModel = (() => {
      let candidate: { model: string; updatedAt: number } | undefined;
      for (const c of chats) {
        const model = c.settings?.model;
        if (!model || c.settings?.tutor_mode) continue;
        if (!candidate || (c.updatedAt ?? 0) > candidate.updatedAt) {
          candidate = { model, updatedAt: c.updatedAt ?? 0 };
        }
      }
      return candidate?.model;
    })();

    const lastUsedModel = !selected?.settings?.tutor_mode
      ? selected?.settings?.model
      : lastNonTutorModel;

    const tutorEnabledGlobally = !!ui.flags.experimentalTutor;
    const braveEnabled = !!ui.flags.experimentalBrave;
    const forceTutorMode = !!(ui.tutor.forceMode ?? false);

    const baseSettings = deriveChatSettingsFromUi({
      ui,
      fallbackModelId: getTierDefaultModelId(),
      fallbackSystem: DEFAULT_BASE_SYSTEM,
      lastUsedModelId: lastUsedModel,
      braveEnabled,
      tutorEnabled: tutorEnabledGlobally,
      forceTutorMode,
    });

    const chat: Chat = {
      id,
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      settings: baseSettings,
    };

    await saveChat(chat);
    return chat;
  }

  static async branchChat(params: {
    sourceChat: Chat;
    messages: Message[];
    messageId: string;
  }): Promise<{ chat: Chat; messages: Message[] } | null> {
    const { sourceChat, messages, messageId } = params;
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return null;

    const slice = messages.slice(0, msgIndex + 1);
    const now = Date.now();
    const newChatId = uuidv4();

    const newChat: Chat = {
      id: newChatId,
      title: `${sourceChat.title || 'Chat'} (branch)`,
      createdAt: now,
      updatedAt: now,
      settings: { ...sourceChat.settings },
      folderId: sourceChat.folderId,
    };

    const cloned = slice.map((m) => ({
      ...m,
      id: uuidv4(),
      chatId: newChatId,
    }));

    await saveChatWithMessages(newChat, cloned);

    return { chat: newChat, messages: cloned };
  }

  static async deleteChat(chatId: string): Promise<void> {
    await deleteChatAndMessages(chatId);
  }

  static async updateChat(chat: Chat, changes: Partial<Chat>): Promise<Chat> {
    const updated = { ...chat, ...changes, updatedAt: Date.now() };
    await saveChat(updated);
    return updated;
  }

  static async moveChatToFolder(chat: Chat, folderId?: string): Promise<Chat> {
    const updated = { ...chat, folderId, updatedAt: Date.now() };
    await saveChat(updated);
    return updated;
  }

  static async createFolder(name: string, parentId?: string): Promise<Folder> {
    const id = uuidv4();
    const now = Date.now();
    const folder: Folder = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      isExpanded: true,
      parentId,
    };
    await saveFolder(folder);
    return folder;
  }

  static async updateFolder(folder: Folder, changes: Partial<Folder>): Promise<Folder> {
    const updated = { ...folder, ...changes, updatedAt: Date.now() };
    await saveFolder(updated);
    return updated;
  }

  static async deleteFolder(
    folderId: string,
    allChats: Chat[],
    allFolders: Folder[],
  ): Promise<{ updatedChats: Chat[]; updatedFolders: Folder[] }> {
    const chatsInFolder = allChats.filter((c) => c.folderId === folderId);
    const updatedChats: Chat[] = [];
    for (const chat of chatsInFolder) {
      const u = { ...chat, folderId: undefined, updatedAt: Date.now() };
      await saveChat(u);
      updatedChats.push(u);
    }

    const childFolders = allFolders.filter((f) => f.parentId === folderId);
    const updatedFolders: Folder[] = [];
    for (const childFolder of childFolders) {
      const u = { ...childFolder, parentId: undefined, updatedAt: Date.now() };
      await saveFolder(u);
      updatedFolders.push(u);
    }

    await deleteFolder(folderId);
    return { updatedChats, updatedFolders };
  }
}
