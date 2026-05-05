import type { PersistedAttachment } from '@/lib/types/attachments';
import type { GenerationSettings, SearchProvider } from '@/lib/types/chat';
import type { MessageMetrics } from '@/lib/types/metrics';
import type { LearnerModel, MessageTutor } from '@/lib/types/tutor';
import type { Usage } from '@/lib/api/normalizers';
import type {
  MessageRole,
  MessageSource,
  ToolCallCategory,
  ToolCallStatus,
} from '@/lib/types/enums';
export type {
  MessageRole,
  MessageSource,
  ToolCallCategory,
  ToolCallStatus,
} from '@/lib/types/enums';
export {
  MessageRoleEnum,
  MessageSourceEnum,
  ToolCallCategoryEnum,
  ToolCallStatusEnum,
} from '@/lib/types/enums';

export type GenSettingsSnapshot = GenerationSettings & {
  searchEnabled?: boolean;
  searchProvider?: SearchProvider;
  tutorEnabled?: boolean;
};

export type ToolCallLogEntry = {
  id: string;
  name: string;
  timestamp: number;
  status: ToolCallStatus;
  category?: ToolCallCategory;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  duration?: number;
  metadata?: {
    modelUsed?: string;
    tokensUsed?: number;
    cached?: boolean;
    provider?: string;
    round?: number;
    notes?: string;
    usedContent?: boolean;
    modelUpdated?: boolean;
    planUpdated?: boolean;
    results?: number;
    requested?: number;
    [key: string]: unknown;
  };
};

export type MessageActivityItem =
  | {
      id: string;
      type: 'reasoning';
      text: string;
      timestamp: number;
      status?: 'streaming' | 'done';
      round?: number;
    }
  | {
      id: string;
      type: 'tool_call';
      name: string;
      timestamp: number;
      status: ToolCallStatus;
      input?: Record<string, unknown>;
      output?: Record<string, unknown>;
      error?: string;
      duration?: number;
      category?: ToolCallCategory;
      round?: number;
      metadata?: ToolCallLogEntry['metadata'];
    }
  | {
      id: string;
      type: 'text';
      text: string;
      timestamp: number;
      status?: 'streaming' | 'done';
      round?: number;
    };

export type MessageLegacyResearch = {
  trace: unknown[];
  answer?: string;
};

export type Message = {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  // Not shown in the UI, but included in LLM conversation history
  hiddenContent?: string;
  // Snapshot of the exact system prompt used for this assistant message
  // so regen can reproduce the same context even if chat settings changed.
  systemSnapshot?: string;
  // Snapshot of generation settings used for this assistant message
  // (temperature, top_p, tokens, reasoning, and feature toggles)
  genSettings?: GenSettingsSnapshot;
  // OpenRouter: file parsing annotations returned by assistant (e.g., PDF parsing)
  // When present, we include them in subsequent requests to skip re-parsing costs.
  annotations?: unknown;
  createdAt: number;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  // For thinking models; accumulated via streaming
  reasoning?: string;
  // Legacy research trace data retained so older saved chats can still deserialize.
  deepResearch?: MessageLegacyResearch;
  metrics?: MessageMetrics;
  usage?: Usage;
  // Optional attachments (currently images) associated to the message
  attachments?: PersistedAttachment[];
  metadata?: {
    hiddenFromUser?: boolean;
    kind?: string;
    /** Legacy source marker retained for imported chats. */
    source?: MessageSource;
    /** Legacy audio length retained for imported chats. */
    audioLengthMs?: number;
  };
  // Optional: persisted tutor payload for interactive content and attempts
  tutor?: MessageTutor;
  tutorWelcome?: boolean;
  // Learner Model (attached to assistant messages)
  learnerModel?: LearnerModel; // Snapshot of learner model at this point
  // Plan Updates (track what changed in this interaction)
  planUpdates?: {
    statusChanges?: { nodeId: string; from: string; to: string }[];
    masteryChanges?: { nodeId: string; from: number; to: number }[];
    summary?: string;
  };
  // Tool call transparency log for this assistant turn
  toolCalls?: ToolCallLogEntry[];
  // Ordered stream of model activity for this assistant turn.
  activity?: MessageActivityItem[];
};
