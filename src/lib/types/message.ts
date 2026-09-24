import type { PersistedAttachment } from '@/lib/types/attachments';
import type { GenerationSettings, SearchMode } from '@/lib/types/chat';
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
  searchProvider?: SearchMode;
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
      /** How long the model thought, in ms: from its first thought to its first word of answer. */
      duration?: number;
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

/** One call of a replayable tool, kept so later turns can see it as a real tool call. */
export type MessageToolRoundCall = {
  /** Provider tool-call id; sanitized and made unique again when replayed. */
  id: string;
  name: string;
  /** The call's arguments as a JSON string. */
  arguments: string;
  /** The tool message content the model read back (compact JSON). */
  result: string;
};

/**
 * One round of an agent-mode turn that called replayable tools: the text the
 * model wrote before calling them, then the calls. The message's `content` is
 * every round's text joined by blank lines, followed by the closing text.
 */
export type MessageToolRound = {
  text: string;
  calls: MessageToolRoundCall[];
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
  // Why the provider stopped generating; 'content_filter' marks a safety
  // classifier refusal (Anthropic stop_reason "refusal") the UI must surface.
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  // Policy category the provider reported for a classifier refusal.
  stopPolicy?: string;
  // A reply that ended before the model finished: the person stopped it, the
  // request failed, or the page closed mid-stream (the checkpoint's mark,
  // cleared when the turn completes). Absent on a reply that finished.
  cutOff?: 'stopped' | 'failed' | 'interrupted';
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  // For thinking models; accumulated via streaming
  reasoning?: string;
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
  /**
   * The tutor's cards and attempts from before its event log.
   * @deprecated legacy: read by the import only. Cards now render from tutor events.
   */
  tutor?: MessageTutor;
  tutorWelcome?: boolean;
  /**
   * A user message that records an action taken in the interface (answering
   * a card, approving a plan) rather than typed words. The model reads it as
   * an ordinary user message; the transcript sets it as a quiet line.
   */
  ledger?: true;
  /**
   * A snapshot of the learner model after this turn, from before the event log.
   * @deprecated legacy: read by the import only.
   */
  learnerModel?: LearnerModel;
  /**
   * What this turn changed in the plan and the learner model, from before the event log.
   * @deprecated legacy: read by the import only.
   */
  planUpdates?: {
    statusChanges?: { nodeId: string; from: string; to: string }[];
    masteryChanges?: { nodeId: string; from: number; to: number }[];
    summary?: string;
  };
  /**
   * The position in the chat's tutor event log that this assistant turn saw
   * when it was composed. The next turn reports what the learner changed after it.
   */
  tutorSeq?: number;
  // Tool call transparency log for this assistant turn
  toolCalls?: ToolCallLogEntry[];
  // Ordered stream of model activity for this assistant turn.
  activity?: MessageActivityItem[];
  // Rounds of replayable tool calls, replayed to the model as real tool messages.
  toolRounds?: MessageToolRound[];
};
