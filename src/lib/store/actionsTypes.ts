import type { LearnerModelFeedback } from '@/lib/agent/learner-model';
import type {
  ChatSettingsPatch,
  DraftAttachment,
  Message,
  MessageTutor,
  TutorEvent,
} from '@/lib/types';
import type { UISearchState, UIStatePartial } from '@/lib/store/uiTypes';
import type { NoticeId } from '@/lib/store/notices';

export type StoreActions = {
  // lifecycle
  initializeApp: () => Promise<void>;

  // chats
  newChat: () => Promise<void>;
  selectChat: (id: string) => void;
  ensureChatMessagesLoaded: (chatId: string) => Promise<void>;
  ensureAllChatMessagesLoaded: () => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  clearChatMessages: (chatId?: string) => void;
  updateChatSettings: (partial: ChatSettingsPatch) => Promise<void>;
  moveChatToFolder: (chatId: string, folderId?: string) => Promise<void>;

  // folders
  createFolder: (name: string, parentId?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  toggleFolderExpanded: (id: string) => Promise<void>;

  // ui
  setUI: (partial: UIStatePartial) => void;
  setNotice: (notice?: NoticeId | string) => void;
  setSearchStatus: (
    messageId: string,
    entry: NonNullable<UISearchState['tavilyByMessageId']>[string],
  ) => void;

  // tutor
  logTutorResult: (evt: TutorEvent) => Promise<void>;
  loadTutorProfileIntoUI: (chatId?: string) => Promise<void>;
  primeTutorWelcomePreview: () => Promise<string | undefined>;
  prepareTutorWelcomeMessage: (chatId?: string) => Promise<string | undefined>;
  applyLearnerModelFeedbackFromUser: (input: LearnerModelFeedback) => Promise<void>;
  patchTutorEntry: (
    messageId: string,
    patch: Partial<MessageTutor>,
    opts?: { persist?: boolean },
  ) => Promise<void>;
  setTutorAttemptMcq: (
    messageId: string,
    itemId: string,
    choiceIdx: number,
    correct: boolean,
  ) => void;
  setTutorPlanProposalStatus: (
    messageId: string,
    status: 'pending' | 'approved' | 'declined',
  ) => void;

  // models
  loadModels: (opts?: { showErrors?: boolean }) => Promise<void>;
  toggleFavoriteModel: (id: string) => void;
  hideModel: (id: string) => void;
  unhideModel: (id: string) => void;
  resetHiddenModels: () => void;
  removeModelFromDropdown: (id: string) => void;

  // messaging
  sendUserMessage: (
    content: string,
    opts?: {
      attachments?: DraftAttachment[];
      metadata?: Message['metadata'];
    },
  ) => Promise<void>;
  // chat branching
  branchChatFromMessage: (messageId: string) => Promise<void>;
  stopStreaming: () => void;
  regenerateAssistantMessage: (messageId: string, opts?: { modelId?: string }) => Promise<void>;
  editUserMessage: (
    messageId: string,
    newContent: string,
    opts?: { rerun?: boolean },
  ) => Promise<void>;
  editAssistantMessage: (messageId: string, newContent: string) => Promise<void>;
  // utility for UI features (e.g., multi-model responses inserting a result)
  appendAssistantMessage: (content: string, opts?: { modelId?: string }) => Promise<void>;
  // tutor persistence
  persistTutorStateForMessage: (messageId: string) => Promise<void>;
};
