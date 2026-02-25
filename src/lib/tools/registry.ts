import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import type { TutorPhase } from '@/lib/agent/tutor/types';
import type { ToolExecutionArgs, PlanningToolExecutionResult } from '@/lib/tools/execution';
import type { ToolDefinition } from '@/lib/transport/contracts';
import { mergeSearchResults, performWebSearchTool } from '@/lib/search';
import { NOTICE_MISSING_BRAVE_KEY } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';
import { WEB_SEARCH_TOOL } from '@/lib/tools/definitions/webSearch';
import { advanceTopicTool } from '@/lib/tools/definitions/tutor/advanceTopic';
import { askStudentQuestionTool } from '@/lib/tools/definitions/tutor/askStudentQuestion';
import { createDiagnosticTool } from '@/lib/tools/definitions/tutor/createDiagnostic';
import { learningPlanTool } from '@/lib/tools/definitions/tutor/learningPlan';
import { quizTool } from '@/lib/tools/definitions/tutor/quiz';
import { recordLearningTool } from '@/lib/tools/definitions/tutor/recordLearning';

export type ToolCategory = 'tutor_content' | 'tutor_meta' | 'search' | 'other';

export type TutorToolTag = 'quiz' | 'plan' | 'learnerModel' | 'baseline' | 'diagnostic';

export type TutorToolPriorityGroup = 'intake' | 'diagnostic' | 'plan' | 'practice';

type ToolTags = Partial<Record<TutorToolTag, true>>;

export type ToolMetadata = {
  category: ToolCategory;
  phases?: TutorPhase[];
  priorityGroup?: TutorToolPriorityGroup;
  tags?: ToolTags;
};

export type PlanningToolHandler = (args: ToolExecutionArgs) => Promise<PlanningToolExecutionResult>;

export const TUTOR_TOOL_NAMES = [
  'ask_student_question',
  'create_diagnostic',
  'learning_plan',
  'record_learning',
  'advance_topic',
  'quiz',
] as const;

export type TutorToolName = (typeof TUTOR_TOOL_NAMES)[number];

export type ToolName = 'web_search' | TutorToolName;

export const TOOL_NAMES = ['web_search', ...TUTOR_TOOL_NAMES] as const;

const TUTOR_TOOL_METADATA: Record<TutorToolName, ToolMetadata> = {
  ask_student_question: {
    category: 'tutor_content',
    phases: ['intake'],
    priorityGroup: 'intake',
    tags: { baseline: true },
  },
  create_diagnostic: {
    category: 'tutor_content',
    phases: ['intake', 'diagnostic'],
    priorityGroup: 'diagnostic',
    tags: { diagnostic: true },
  },
  learning_plan: {
    category: 'tutor_content',
    phases: ['intake', 'planning', 'teaching', 'practice'],
    priorityGroup: 'plan',
    tags: { plan: true },
  },
  record_learning: {
    category: 'tutor_meta',
    phases: ['diagnostic', 'practice', 'review', 'teaching'],
    tags: { learnerModel: true },
  },
  advance_topic: {
    category: 'tutor_meta',
    phases: ['teaching', 'practice', 'review'],
    tags: { plan: true },
  },
  quiz: {
    category: 'tutor_content',
    phases: ['diagnostic', 'practice', 'teaching'],
    priorityGroup: 'practice',
    tags: { quiz: true },
  },
};

const TUTOR_TOOL_DEFINITIONS: Record<TutorToolName, ToolDefinition> = {
  ask_student_question: askStudentQuestionTool,
  create_diagnostic: createDiagnosticTool,
  learning_plan: learningPlanTool,
  record_learning: recordLearningTool,
  advance_topic: advanceTopicTool,
  quiz: quizTool,
};

export type ToolRegistryEntry = {
  definition: ToolDefinition;
  metadata: ToolMetadata;
  handler?: PlanningToolHandler;
};

const executeWebSearchTool: PlanningToolHandler = async ({
  toolCall,
  parsedArgs,
  roundMeta,
  context,
  aggregatedResults,
}) => {
  const { chatId, assistantMessage, userContent, searchProvider, controller, set, get, logger } =
    context;

  const log = logger.start({
    name: 'web_search',
    input: parsedArgs,
    category: 'search',
    metadata: { ...(roundMeta || {}), provider: searchProvider },
  });

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
  const metadataBase = roundMeta ? { ...roundMeta } : undefined;
  const requestedMeta =
    typeof searchArgs.count === 'number' ? { requested: searchArgs.count } : undefined;

  if (searchResult.ok) {
    const merged = mergeSearchResults([aggregatedResults, searchResult.results]);
    const payload = searchResult.results.slice(0, MAX_FALLBACK_RESULTS).map((result) => ({
      title: result?.title,
      url: result?.url,
      description: result?.description,
    }));
    output.resultsPreview = payload.slice(0, 3);
    log.success(output, {
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
  log.error(
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
};

const createTutorHandler = (name: TutorToolName, metadata: ToolMetadata): PlanningToolHandler => {
  return async ({ toolCall, parsedArgs, roundMeta, context, aggregatedResults }) => {
    const { chat, chatId, assistantMessage, set, get, persistMessage, logger, getCurrentPlan } =
      context;

    const log = logger.start({
      name,
      input: parsedArgs,
      category: 'tutor',
      metadata: roundMeta,
    });

    const { applyTutorToolCall, recordTutorToolUsage } = await import('@/lib/agent/tools/tutor');

    const tutorOutcome = await applyTutorToolCall({
      name,
      args: parsedArgs,
      chat,
      chatId,
      assistantMessage,
      set,
      get,
      persistMessage,
      getCurrentPlan,
    });
    const output: Record<string, unknown> = {
      handled: tutorOutcome.handled,
      usedContent: tutorOutcome.usedContent,
    };
    if (tutorOutcome.error) output.error = tutorOutcome.error;
    if (tutorOutcome.payload) output.payload = tutorOutcome.payload;
    if (tutorOutcome.learnerModelDebug) output.learnerModelDebug = tutorOutcome.learnerModelDebug;
    if (tutorOutcome.planUpdates) output.planUpdates = tutorOutcome.planUpdates;
    if (tutorOutcome.learnerModel) output.learnerModel = tutorOutcome.learnerModel;

    if (tutorOutcome.handled) {
      recordTutorToolUsage({
        set,
        chatId,
        assistantMessageId: assistantMessage.id,
        plan: tutorOutcome.updatedPlan ?? chat.settings.features.tutor.learningPlan,
        name,
      });
      log.success(output, {
        ...(roundMeta || {}),
        ...(tutorOutcome.usedContent ? { usedContent: true } : {}),
        ...(tutorOutcome.learnerModel ? { modelUpdated: true } : {}),
        ...(tutorOutcome.planUpdates ? { planUpdated: true } : {}),
      });
      const toolResultContent = tutorOutcome.payload || JSON.stringify({ ok: true });
      const usedTutorContentTool =
        metadata.category === 'tutor_content' ? tutorOutcome.handled : !!tutorOutcome.usedContent;
      return {
        convoMessages: [
          {
            role: 'tool',
            name,
            tool_call_id: toolCall.id,
            content: toolResultContent,
          },
        ],
        aggregatedResults,
        usedTool: true,
        usedTutorContentTool,
        learnerModel: tutorOutcome.learnerModel,
        planUpdates: tutorOutcome.planUpdates,
        updatedPlan: tutorOutcome.updatedPlan,
        learnerModelDebug: tutorOutcome.learnerModelDebug,
      };
    }

    log.error(output, 'Tutor tool call was not handled', roundMeta ? { ...roundMeta } : undefined);
    return {
      convoMessages: [
        {
          role: 'tool',
          name,
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: false,
            error: tutorOutcome.error || `Tutor tool "${name}" call was not handled`,
          }),
        },
      ],
      aggregatedResults,
      usedTool: false,
      usedTutorContentTool: false,
    };
  };
};

const tutorEntries = Object.fromEntries(
  TUTOR_TOOL_NAMES.map((name) => [
    name,
    {
      definition: TUTOR_TOOL_DEFINITIONS[name],
      metadata: TUTOR_TOOL_METADATA[name],
      handler: createTutorHandler(name, TUTOR_TOOL_METADATA[name]),
    },
  ]),
) as Record<TutorToolName, ToolRegistryEntry>;

export const TOOL_REGISTRY: Record<ToolName, ToolRegistryEntry> = {
  web_search: {
    definition: WEB_SEARCH_TOOL,
    metadata: { category: 'search' },
    handler: executeWebSearchTool,
  },
  ...tutorEntries,
};

const tutorToolNameSet = new Set<TutorToolName>(TUTOR_TOOL_NAMES);

export function isToolName(value: string): value is ToolName {
  return value in TOOL_REGISTRY;
}

export function isTutorToolName(value: string): value is TutorToolName {
  return tutorToolNameSet.has(value as TutorToolName);
}

export function getToolCategory(name: string): ToolCategory {
  return TOOL_REGISTRY[name as ToolName]?.metadata.category ?? 'other';
}

export function isTutorContentTool(name: string): boolean {
  return getToolCategory(name) === 'tutor_content';
}

export function isTutorMetaTool(name: string): boolean {
  return getToolCategory(name) === 'tutor_meta';
}

export function isSearchTool(name: string): boolean {
  return getToolCategory(name) === 'search';
}

export function getTutorToolDefinitions(): ToolDefinition[] {
  return TUTOR_TOOL_NAMES.map((name) => TOOL_REGISTRY[name].definition);
}

export function getTutorToolsByPhase(phase: TutorPhase): TutorToolName[] {
  return TUTOR_TOOL_NAMES.filter((name) => TOOL_REGISTRY[name].metadata.phases?.includes(phase));
}

export function getTutorToolsByTag(tag: TutorToolTag): TutorToolName[] {
  return TUTOR_TOOL_NAMES.filter((name) => TOOL_REGISTRY[name].metadata.tags?.[tag]);
}

export function getTutorToolsByPriorityGroup(group: TutorToolPriorityGroup): TutorToolName[] {
  return TUTOR_TOOL_NAMES.filter((name) => TOOL_REGISTRY[name].metadata.priorityGroup === group);
}

export const tutorContentTools = TUTOR_TOOL_NAMES.filter((name) => isTutorContentTool(name));

export const tutorMetaTools = TUTOR_TOOL_NAMES.filter((name) => isTutorMetaTool(name));

export function getToolHandler(name: string): PlanningToolHandler | undefined {
  return TOOL_REGISTRY[name as ToolName]?.handler;
}
