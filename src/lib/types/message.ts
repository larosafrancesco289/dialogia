import type { ProviderSort } from '@/lib/models/providerSort';
import type { PersistedAttachment } from '@/lib/types/attachments';
import type { ChatSettings } from '@/lib/types/chat';
import type { DeepResearchEvent } from '@/lib/types/deepResearch';
import type { MessageMetrics } from '@/lib/types/metrics';
import type { LearnerModel, MessageTutor } from '@/lib/types/tutor';

export type GenSettingsSnapshot = Pick<
  ChatSettings,
  | 'temperature'
  | 'top_p'
  | 'max_tokens'
  | 'reasoning_effort'
  | 'reasoning_tokens'
  | 'search_enabled'
  | 'search_provider'
  | 'tutor_mode'
> & {
  providerSort?: ProviderSort;
};

export type ToolCallLogEntry = {
  id: string;
  name: string;
  timestamp: number;
  status: 'pending' | 'success' | 'error';
  category?: 'search' | 'tutor' | 'planning' | 'system' | 'other';
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

export type MessageDeepResearch = {
  trace: DeepResearchEvent[];
  answer?: string;
};

export type Message = {
  id: string;
  chatId: string;
  role: 'system' | 'user' | 'assistant';
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
  // DeepResearch trace data (separate from model reasoning tokens)
  deepResearch?: MessageDeepResearch;
  metrics?: MessageMetrics;
  // Optional attachments (currently images) associated to the message
  attachments?: PersistedAttachment[];
  metadata?: {
    hiddenFromUser?: boolean;
    kind?: string;
    /** Source of the message (e.g., 'voice' for voice agent) */
    source?: 'voice' | 'text';
    /** Audio length in ms (for voice messages) */
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
};
