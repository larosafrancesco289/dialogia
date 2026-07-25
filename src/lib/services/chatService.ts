// Module: services/chatService
// Responsibility: Persist chat and folder mutations through the repository.

import { v4 as uuidv4 } from 'uuid';
import type { Repository } from '@/lib/db/repository';
import type { Chat, Folder, Message, ModelDescriptor } from '@/lib/types';
import { resolveDynamicModelId } from '@/lib/models';
import type { UIState } from '@/lib/store/types';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { resolveNewChatSettings } from '@/lib/settings/resolve';
import type { AccessTier } from '@/lib/auth/types';
import { getDefaultModelIdForTier } from '@/lib/auth/tierFeatures';
import { ensureHiddenTutorContent } from '@/lib/services/messagePersistence';

export class ChatService {
  static buildSettingsForNewChat(params: {
    ui: UIState;
    chats: Chat[];
    selectedChatId?: string;
    tier: AccessTier;
    models?: ModelDescriptor[];
  }): Chat['settings'] {
    const { ui, chats, selectedChatId, tier, models = [] } = params;
    const selected = selectedChatId ? chats.find((c) => c.id === selectedChatId) : undefined;

    const lastNonTutorModel = (() => {
      let candidate: { modelId: string; updatedAt: number } | undefined;
      for (const c of chats) {
        const modelId = c.settings?.modelId;
        if (!modelId || c.settings?.features.tutor?.enabled) continue;
        if (!candidate || (c.updatedAt ?? 0) > candidate.updatedAt) {
          candidate = { modelId, updatedAt: c.updatedAt ?? 0 };
        }
      }
      return candidate?.modelId;
    })();

    const lastUsedModel = !selected?.settings?.features.tutor?.enabled
      ? selected?.settings?.modelId
      : lastNonTutorModel;

    const tutorEnabledGlobally = !!ui.flags.experimentalTutor;
    const forceTutorMode = !!(ui.tutor?.forceMode ?? false);

    const settings = resolveNewChatSettings({
      ui,
      fallbackModelId: resolveDynamicModelId(getDefaultModelIdForTier(tier), models),
      fallbackSystem: DEFAULT_BASE_SYSTEM,
      lastUsedModelId: lastUsedModel,
      defaults: ui.chatDefaults,
      tutorEnabled: tutorEnabledGlobally,
      forceTutorMode,
    });
    // Chats persist concrete model ids; resolve any dynamic alias that
    // slipped through defaults (e.g. the tutor default model).
    settings.modelId = resolveDynamicModelId(settings.modelId, models);
    const tutorDefaultModelId = settings.features.tutor?.defaultModelId;
    if (tutorDefaultModelId) {
      settings.features.tutor = {
        ...settings.features.tutor,
        defaultModelId: resolveDynamicModelId(tutorDefaultModelId, models),
      };
    }
    return settings;
  }

  static async createChat(params: {
    ui: UIState;
    chats: Chat[];
    selectedChatId?: string;
    repository: Repository;
    tier: AccessTier;
    models?: ModelDescriptor[];
  }): Promise<Chat> {
    const { ui, chats, selectedChatId, repository, tier, models } = params;
    const id = uuidv4();
    const now = Date.now();
    const baseSettings = ChatService.buildSettingsForNewChat({
      ui,
      chats,
      selectedChatId,
      tier,
      models,
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
