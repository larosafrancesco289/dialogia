import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import { mergeSearchResults } from '@/lib/agent/searchFlow';
import {
  applyTutorToolCall,
  isTutorToolName,
  performWebSearchTool,
  recordTutorToolUsage,
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
import { NOTICE_MISSING_BRAVE_KEY } from '@/lib/store/notices';
import { isTutorContentTool } from '@/lib/agent/tools/categories';
import type { ToolExecutionLogger } from '@/lib/agent/tools/executionLogger';
import { notify } from '@/lib/store/notify';

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
  context: ToolExecutionContext;
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
    logger,
  } = context;

  const callName = toolCall.function.name;
  const shouldLog = callName === 'web_search' || isTutorToolName(callName);
  const log = shouldLog
    ? logger.start({
        name: callName,
        input: parsedArgs,
        category:
          callName === 'web_search' ? 'search' : isTutorToolName(callName) ? 'tutor' : 'other',
        metadata:
          callName === 'web_search'
            ? { ...(roundMeta || {}), provider: searchProvider }
            : roundMeta,
      })
    : undefined;

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
        get,
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
        log?.success(output, {
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
        notify(get, NOTICE_MISSING_BRAVE_KEY);
      }
      log?.error(
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
        if (isTutorToolName(callName)) {
          recordTutorToolUsage({
            set,
            chatId,
            assistantMessageId: assistantMessage.id,
            plan: tutorOutcome.updatedPlan ?? chat.settings.features.tutor.learningPlan,
            name: callName,
          });
        }
        log?.success(output, {
          ...(roundMeta || {}),
          ...(tutorOutcome.usedContent ? { usedContent: true } : {}),
          ...(tutorOutcome.learnerModel ? { modelUpdated: true } : {}),
          ...(tutorOutcome.planUpdates ? { planUpdated: true } : {}),
        });
        // Always return a tool result message - OpenRouter/OpenAI require every tool_call
        // to have a corresponding tool result, even if the tool has no meaningful output
        const toolResultContent = tutorOutcome.payload || JSON.stringify({ ok: true });
        return {
          convoMessages: [
            {
              role: 'tool',
              name: callName,
              tool_call_id: toolCall.id,
              content: toolResultContent,
            } as ModelMessage,
          ],
          aggregatedResults,
          usedTool: true,
          usedTutorContentTool: contentTool ? tutorOutcome.handled : !!tutorOutcome.usedContent,
          learnerModel: tutorOutcome.learnerModel,
          planUpdates: tutorOutcome.planUpdates,
          updatedPlan: tutorOutcome.updatedPlan,
          learnerModelDebug: tutorOutcome.learnerModelDebug,
        };
      }

      log?.error(
        output,
        'Tutor tool call was not handled',
        roundMeta ? { ...roundMeta } : undefined,
      );
      // Return a tool result even for unhandled tools to maintain conversation integrity
      return {
        convoMessages: [
          {
            role: 'tool',
            name: callName,
            tool_call_id: toolCall.id,
            content: JSON.stringify({ ok: false, error: 'Tool call was not handled' }),
          } as ModelMessage,
        ],
        aggregatedResults,
        usedTool: true,
        usedTutorContentTool: false,
      };
    }

    log?.error(
      undefined,
      `Unsupported tool: ${callName}`,
      roundMeta ? { ...roundMeta } : undefined,
    );
    // Return a tool result even for unsupported tools
    return {
      convoMessages: [
        {
          role: 'tool',
          name: callName,
          tool_call_id: toolCall.id,
          content: JSON.stringify({ ok: false, error: `Unsupported tool: ${callName}` }),
        } as ModelMessage,
      ],
      aggregatedResults,
      usedTool: false,
      usedTutorContentTool: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.error(undefined, message, roundMeta ? { ...roundMeta } : undefined);
    throw error;
  }
}
