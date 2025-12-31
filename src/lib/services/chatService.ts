import { v4 as uuidv4 } from 'uuid';
import type { Repository } from '@/lib/db/repository';
import type { Chat, Folder, Message } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/policy';
import { resolveNewChatSettings } from '@/lib/settings/resolve';
import { DEFAULT_FREE_MODEL_ID } from '@/data/freeModels';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { getCookie } from '@/lib/auth/cookies.client';
import { ensureHiddenTutorContent } from '@/lib/services/messagePersistence';

// Read tier from cookie on client side
function getClientTier(): 'free' | 'individual' | 'developer' | 'study' {
  const tier = getCookie(TIER_COOKIE_NAME);
  if (tier === 'developer' || tier === 'individual' || tier === 'free' || tier === 'study') {
    return tier;
  }
  return 'free';
}

// Get the appropriate default model based on tier
function getTierDefaultModelId(): string {
  const tier = getClientTier();
  // Study tier should use the standard model, not the free model
  return tier === 'free' ? DEFAULT_FREE_MODEL_ID : DEFAULT_MODEL_ID;
}

export class ChatService {
  static async createChat(params: {
    ui: UIState;
    chats: Chat[];
    selectedChatId?: string;
    repository: Repository;
  }): Promise<Chat> {
    const { ui, chats, selectedChatId, repository } = params;
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
    // Study tier always has tutor mode forced
    const isStudyTier = getClientTier() === 'study';
    const forceTutorMode = isStudyTier || !!(ui.tutor.forceMode ?? false);

    const baseSettings = resolveNewChatSettings({
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

    await repository.saveChat(chat);
    return chat;
  }

  static async branchChat(params: {
    sourceChat: Chat;
    messages: Message[];
    messageId: string;
    repository: Repository;
  }): Promise<{ chat: Chat; messages: Message[] } | null> {
    const { sourceChat, messages, messageId, repository } = params;
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

    const cloned = slice.map((m) =>
      ensureHiddenTutorContent({
        ...m,
        id: uuidv4(),
        chatId: newChatId,
      }),
    );

    await repository.saveChatWithMessages(newChat, cloned);

    return { chat: newChat, messages: cloned };
  }

  static async deleteChat(chatId: string, repository: Repository): Promise<void> {
    await repository.deleteChatAndMessages(chatId);
  }

  static async updateChat(
    chat: Chat,
    changes: Partial<Chat>,
    repository: Repository,
  ): Promise<Chat> {
    const updated = { ...chat, ...changes, updatedAt: Date.now() };
    await repository.saveChat(updated);
    return updated;
  }

  static async moveChatToFolder(
    chat: Chat,
    folderId: string | undefined,
    repository: Repository,
  ): Promise<Chat> {
    const updated = { ...chat, folderId, updatedAt: Date.now() };
    await repository.saveChat(updated);
    return updated;
  }

  static async createFolder(
    name: string,
    parentId: string | undefined,
    repository: Repository,
  ): Promise<Folder> {
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
    await repository.saveFolder(folder);
    return folder;
  }

  static async updateFolder(
    folder: Folder,
    changes: Partial<Folder>,
    repository: Repository,
  ): Promise<Folder> {
    const updated = { ...folder, ...changes, updatedAt: Date.now() };
    await repository.saveFolder(updated);
    return updated;
  }

  static async deleteFolder(
    folderId: string,
    allChats: Chat[],
    allFolders: Folder[],
    repository: Repository,
  ): Promise<{ updatedChats: Chat[]; updatedFolders: Folder[] }> {
    const chatsInFolder = allChats.filter((c) => c.folderId === folderId);
    const updatedChats: Chat[] = [];
    for (const chat of chatsInFolder) {
      const u = { ...chat, folderId: undefined, updatedAt: Date.now() };
      await repository.saveChat(u);
      updatedChats.push(u);
    }

    const childFolders = allFolders.filter((f) => f.parentId === folderId);
    const updatedFolders: Folder[] = [];
    for (const childFolder of childFolders) {
      const u = { ...childFolder, parentId: undefined, updatedAt: Date.now() };
      await repository.saveFolder(u);
      updatedFolders.push(u);
    }

    await repository.deleteFolder(folderId);
    return { updatedChats, updatedFolders };
  }
}
