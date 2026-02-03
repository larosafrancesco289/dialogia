import type {
  ModelMessage,
  PersistMessage,
  SearchProvider,
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
  searchProvider: SearchProvider;
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

export type PlanningToolExecutionResult = {
  convoMessages: ModelMessage[];
  aggregatedResults: SearchResult[];
  usedTool: boolean;
  usedTutorContentTool: boolean;
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
