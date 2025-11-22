import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import { mergeSearchResults } from '@/lib/agent/searchFlow';
import {
  applyTutorToolCall,
  isTutorToolName,
  performWebSearchTool,
} from '@/lib/agent/tools';
import type {
  ModelMessage,
  PersistMessage,
  PlanTurnResult,
  SearchProvider,
  SearchResult,
  StoreGetter,
  StoreSetter,
  ToolCall,
} from '@/lib/agent/types';
import type { Chat, LearningPlan, LearnerModel, Message, ToolCallLogEntry } from '@/lib/types';
import { startToolCallLogEntry, updateToolCallLogEntry } from '@/lib/services/toolCallLog';
import { NOTICE_MISSING_BRAVE_KEY } from '@/lib/store/notices';
import { isTutorContentTool } from '@/lib/agent/tools/categories';

export type PlanningToolExecutionContext = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  userContent: string;
  searchProvider: SearchProvider;
  controller: AbortController;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: PersistMessage;
};

export type PlanningToolExecutionResult = {
  convoMessages: ModelMessage[];
  aggregatedResults: SearchResult[];
  usedTool: boolean;
  usedTutorContentTool: boolean;
  learnerModel?: LearnerModel;
  planUpdates?: Message['planUpdates'];
  updatedPlan?: LearningPlan;
  learnerModelDebug?: PlanTurnResult['learnerModelDebug'];
};

export async function executePlanningToolCall(opts: {
  toolCall: ToolCall;
  parsedArgs: Record<string, unknown>;
  roundMeta?: ToolCallLogEntry['metadata'];
  context: PlanningToolExecutionContext;
  aggregatedResults: SearchResult[];
}): Promise<PlanningToolExecutionResult> {
  const { toolCall, parsedArgs, roundMeta, context, aggregatedResults } = opts;
  const {
    chat,
    chatId,
    assistantMessage,
    userContent,
    searchProvider,
    controller,
    set,
    get,
    persistMessage,
  } = context;

  const callName = toolCall.function.name;
  const shouldLog = callName === 'web_search' || isTutorToolName(callName);
  const logEntry = shouldLog
    ? startToolCallLogEntry({
        set,
        chatId,
        messageId: assistantMessage.id,
        name: callName,
        input: parsedArgs,
        category: callName === 'web_search' ? 'search' : isTutorToolName(callName) ? 'tutor' : 'other',
        metadata:
          callName === 'web_search'
            ? { ...(roundMeta || {}), provider: searchProvider }
            : roundMeta,
      })
    : undefined;
  const startedAt = logEntry ? performance.now() : undefined;
  const finalizeLog = (
    status: 'success' | 'error',
    output?: Record<string, unknown>,
    errorMessage?: string,
    metadataPatch?: ToolCallLogEntry['metadata'],
  ) => {
    if (!logEntry) return;
    updateToolCallLogEntry({
      set,
      chatId,
      messageId: assistantMessage.id,
      toolCallId: logEntry.id,
      updates: {
        status,
        output,
        error: errorMessage,
        duration:
          startedAt != null ? Math.max(0, Math.round(performance.now() - startedAt)) : undefined,
        metadata: metadataPatch,
      },
    });
  };

  const emptyResult: PlanningToolExecutionResult = {
    convoMessages: [],
    aggregatedResults,
    usedTool: false,
    usedTutorContentTool: false,
  };

  try {
    if (callName === 'web_search') {
      const searchArgs = {
        query: typeof parsedArgs.query === 'string' ? parsedArgs.query : '',
        count: typeof parsedArgs.count === 'number' ? parsedArgs.count : undefined,
      };
      const searchResult = await performWebSearchTool({
        args: searchArgs,
        fallbackQuery: userContent,
        searchProvider,
        controller,
        assistantMessageId: assistantMessage.id,
        chatId,
        set,
      });
      const output: Record<string, unknown> = {
        ok: searchResult.ok,
        query: searchResult.query,
      };
      const metadataBase: ToolCallLogEntry['metadata'] | undefined = roundMeta
        ? { ...roundMeta }
        : undefined;
      const requestedMeta =
        typeof searchArgs.count === 'number' ? { requested: searchArgs.count } : undefined;

      if (searchResult.ok) {
        const merged = mergeSearchResults([aggregatedResults, searchResult.results]);
        const payload = searchResult.results.slice(0, MAX_FALLBACK_RESULTS).map((r) => ({
          title: r?.title,
          url: r?.url,
          description: r?.description,
        }));
        output.resultsPreview = payload.slice(0, 3);
        finalizeLog('success', output, undefined, {
          ...(metadataBase || {}),
          ...(requestedMeta || {}),
          results: searchResult.results.length,
        });
        return {
          convoMessages: [
            {
              role: 'tool',
              name: 'web_search',
              tool_call_id: toolCall.id,
              content: JSON.stringify(payload),
            },
          ],
          aggregatedResults: merged,
          usedTool: true,
          usedTutorContentTool: false,
        };
      }

      if (searchResult.error === NOTICE_MISSING_BRAVE_KEY) {
        set((state) => ({ ui: { ...state.ui, notice: NOTICE_MISSING_BRAVE_KEY } }));
      }
      finalizeLog(
        'error',
        output,
        searchResult.error || 'Search returned no results',
        metadataBase
          ? { ...metadataBase, ...(requestedMeta || {}) }
          : requestedMeta
            ? { ...requestedMeta }
            : undefined,
      );
      return {
        convoMessages: [
          {
            role: 'tool',
            name: 'web_search',
            tool_call_id: toolCall.id,
            content: 'No results',
          },
        ],
        aggregatedResults,
        usedTool: true,
        usedTutorContentTool: false,
      };
    }

    if (isTutorToolName(callName)) {
      const contentTool = isTutorContentTool(callName);
      const tutorOutcome = await applyTutorToolCall({
        name: callName,
        args: parsedArgs,
        chat,
        chatId,
        assistantMessage,
        set,
        get,
        persistMessage,
      });
      const output: Record<string, unknown> = {
        handled: tutorOutcome.handled,
        usedContent: tutorOutcome.usedContent,
      };
      if (tutorOutcome.payload) output.payload = tutorOutcome.payload;
      if (tutorOutcome.learnerModelDebug) output.learnerModelDebug = tutorOutcome.learnerModelDebug;
      if (tutorOutcome.planUpdates) output.planUpdates = tutorOutcome.planUpdates;
      if (tutorOutcome.learnerModel) output.learnerModel = tutorOutcome.learnerModel;

      if (tutorOutcome.handled) {
        finalizeLog(
          'success',
          output,
          undefined,
          {
            ...(roundMeta || {}),
            ...(tutorOutcome.usedContent ? { usedContent: true } : {}),
            ...(tutorOutcome.learnerModel ? { modelUpdated: true } : {}),
            ...(tutorOutcome.planUpdates ? { planUpdated: true } : {}),
          },
        );
        return {
          convoMessages: tutorOutcome.payload
            ? [
                {
                  role: 'tool',
                  name: callName,
                  tool_call_id: toolCall.id,
                  content: tutorOutcome.payload,
                } as ModelMessage,
              ]
            : [],
          aggregatedResults,
          usedTool: true,
          usedTutorContentTool: contentTool ? tutorOutcome.handled : !!tutorOutcome.usedContent,
          learnerModel: tutorOutcome.learnerModel,
          planUpdates: tutorOutcome.planUpdates,
          updatedPlan: tutorOutcome.updatedPlan,
          learnerModelDebug: tutorOutcome.learnerModelDebug,
        };
      }

      finalizeLog(
        'error',
        output,
        'Tutor tool call was not handled',
        roundMeta ? { ...roundMeta } : undefined,
      );
      return {
        convoMessages: [],
        aggregatedResults,
        usedTool: true,
        usedTutorContentTool: false,
      };
    }

    finalizeLog(
      'error',
      undefined,
      `Unsupported tool: ${callName}`,
      roundMeta ? { ...roundMeta } : undefined,
    );
    return emptyResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finalizeLog('error', undefined, message, roundMeta ? { ...roundMeta } : undefined);
    throw error;
  }
}
