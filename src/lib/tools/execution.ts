import type {
  ModelMessage,
  PersistMessage,
  SearchMode,
  StoreGetter,
  StoreSetter,
} from '@/lib/agent/types';
import type { ToolExecutionLogger } from '@/lib/agent/tools/executionLogger';
import type { SearchResult } from '@/lib/search/types';
import type { Chat, LearningPlan, LearnerModel, Message, ToolCallLogEntry } from '@/lib/types';
import type { ToolCall } from '@/lib/transport/contracts';

export type ToolExecutionContext = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  userContent: string;
  searchProvider: SearchMode;
  controller: AbortController;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: PersistMessage;
  logger: ToolExecutionLogger;
  /**
   * Get the current learning plan, accounting for updates from previous tool calls in the same turn.
   */
  getCurrentPlan?: () => LearningPlan | undefined;
};

/**
 * What the model reads back from a tool call, sent as compact JSON. A success
 * carries the state the model needs next; a failure says what went wrong and
 * how to correct it, so the model can retry in the next round.
 */
export type ToolResult =
  | ({ ok: true } & Record<string, unknown>)
  | ({ ok: false; error: string; hint?: string } & Record<string, unknown>);

export type PlanningToolExecutionResult = {
  /**
   * Messages appended to the conversation. A handler may leave this out and
   * return `result` instead; core then sends that as the call's tool message.
   */
  convoMessages?: ModelMessage[];
  /** The turn's search results after this call. Omitted means unchanged. */
  aggregatedResults?: SearchResult[];
  usedTool: boolean;
  usedContentTool: boolean;
  /** The model-facing result; used when `convoMessages` carries no tool message for the call. */
  result?: ToolResult;
  /**
   * Agent mode only: the turn stops after this round without another model
   * call (the tool put something in front of the user and waits for them).
   */
  endsTurn?: boolean;
  /**
   * What a replayable tool's round stores for later turns, when the live call
   * holds something the model must not see again (an answer key, say).
   * Defaults to the call's own arguments and the result it read.
   */
  replay?: { arguments?: Record<string, unknown>; result?: ToolResult };
  learnerModel?: LearnerModel;
  planUpdates?: Message['planUpdates'];
  updatedPlan?: LearningPlan;
  learnerModelDebug?: import('@/lib/agent/types').PlanTurnResult['learnerModelDebug'];
};

export type ToolExecutionArgs = {
  toolCall: ToolCall;
  parsedArgs: Record<string, unknown>;
  roundMeta?: ToolCallLogEntry['metadata'];
  context: ToolExecutionContext;
  aggregatedResults: SearchResult[];
};
