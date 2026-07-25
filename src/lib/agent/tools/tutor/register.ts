// Module: agent/tools/tutor/register
// Responsibility: The tutor module's tool catalogue — definitions, tutor-private
// metadata, the shared handler, and registration into the core tool registry.

import type { TutorPhase } from '@/lib/agent/tutor/types';
import { advanceTopicTool } from '@/lib/tools/definitions/tutor/advanceTopic';
import { askStudentQuestionTool } from '@/lib/tools/definitions/tutor/askStudentQuestion';
import { createDiagnosticTool } from '@/lib/tools/definitions/tutor/createDiagnostic';
import { learningPlanTool } from '@/lib/tools/definitions/tutor/learningPlan';
import { quizTool } from '@/lib/tools/definitions/tutor/quiz';
import { recordLearningTool } from '@/lib/tools/definitions/tutor/recordLearning';
import type { ToolDefinition } from '@/lib/transport/contracts';
import {
  getTool,
  getToolExt,
  listTools,
  registerTool,
  type PlanningToolHandler,
} from '@/lib/tools/registry';

export const TUTOR_MODULE_ID = 'tutor';

export const TUTOR_TOOL_NAMES = [
  'ask_student_question',
  'create_diagnostic',
  'learning_plan',
  'record_learning',
  'advance_topic',
  'quiz',
] as const;

export type TutorToolName = (typeof TUTOR_TOOL_NAMES)[number];

export type TutorToolTag = 'quiz' | 'plan' | 'learnerModel' | 'diagnostic';

export type TutorToolPriorityGroup = 'intake' | 'diagnostic' | 'plan' | 'practice';

/** Tutor-private slice of `ToolMetadata.ext`. Only tutor code reads this. */
type TutorToolExt = {
  phases: TutorPhase[];
  priorityGroup?: TutorToolPriorityGroup;
  tags?: Partial<Record<TutorToolTag, true>>;
};

const EXT_KEY = 'tutor';

const TUTOR_TOOLS: Record<
  TutorToolName,
  { definition: ToolDefinition; kind: 'content' | 'meta'; ext: TutorToolExt }
> = {
  ask_student_question: {
    definition: askStudentQuestionTool,
    kind: 'content',
    ext: { phases: ['intake'], priorityGroup: 'intake' },
  },
  create_diagnostic: {
    definition: createDiagnosticTool,
    kind: 'content',
    ext: {
      phases: ['intake', 'diagnostic'],
      priorityGroup: 'diagnostic',
      tags: { diagnostic: true },
    },
  },
  learning_plan: {
    definition: learningPlanTool,
    kind: 'content',
    ext: {
      phases: ['intake', 'planning', 'teaching', 'practice'],
      priorityGroup: 'plan',
      tags: { plan: true },
    },
  },
  record_learning: {
    definition: recordLearningTool,
    kind: 'meta',
    ext: {
      phases: ['diagnostic', 'practice', 'review', 'teaching'],
      tags: { learnerModel: true },
    },
  },
  advance_topic: {
    definition: advanceTopicTool,
    kind: 'meta',
    ext: { phases: ['teaching', 'practice', 'review'], tags: { plan: true } },
  },
  quiz: {
    definition: quizTool,
    kind: 'content',
    ext: {
      phases: ['diagnostic', 'practice', 'teaching'],
      priorityGroup: 'practice',
      tags: { quiz: true },
    },
  },
};

const createTutorHandler = (name: TutorToolName, kind: 'content' | 'meta'): PlanningToolHandler => {
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
        plan: tutorOutcome.updatedPlan ?? chat.settings.features.tutor?.learningPlan,
        name,
      });
      log.success(output, {
        ...(roundMeta || {}),
        ...(tutorOutcome.usedContent ? { usedContent: true } : {}),
        ...(tutorOutcome.learnerModel ? { modelUpdated: true } : {}),
        ...(tutorOutcome.planUpdates ? { planUpdated: true } : {}),
      });
      let toolResultContent = tutorOutcome.payload;
      if (!toolResultContent) {
        const debug = tutorOutcome.learnerModelDebug;
        if (debug && debug.oldConfidence != null && debug.newConfidence != null) {
          toolResultContent = JSON.stringify({
            ok: true,
            nodeId: debug.nodeId,
            nodeName: debug.nodeName,
            confidenceBefore: Math.round(debug.oldConfidence * 100) + '%',
            confidenceAfter: Math.round(debug.newConfidence * 100) + '%',
            masteryLevel:
              debug.newConfidence >= 0.8
                ? 'mastered'
                : debug.newConfidence >= 0.5
                  ? 'developing'
                  : 'novice',
          });
        } else {
          toolResultContent = JSON.stringify({ ok: true });
        }
      }
      const usedContentTool =
        kind === 'content' ? tutorOutcome.handled : !!tutorOutcome.usedContent;
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
        usedContentTool,
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
      usedContentTool: false,
    };
  };
};

let registered = false;

export function registerTutorTools(): void {
  if (registered) return;
  registered = true;
  for (const name of TUTOR_TOOL_NAMES) {
    const { definition, kind, ext } = TUTOR_TOOLS[name];
    registerTool(name, {
      definition,
      metadata: { module: TUTOR_MODULE_ID, kind, logCategory: 'tutor', ext: { [EXT_KEY]: ext } },
      handler: createTutorHandler(name, kind),
    });
  }
}

const tutorToolNames = new Set<string>(TUTOR_TOOL_NAMES);

export function isTutorToolName(value: string): value is TutorToolName {
  return tutorToolNames.has(value);
}

const readExt = (name: string): TutorToolExt | undefined =>
  (getToolExt(name, EXT_KEY) as TutorToolExt | undefined) ?? undefined;

/**
 * Accessors must not depend on import order: whoever asks first triggers registration.
 * `registerEnabledModules` remains the app-level entry point; this is the safety net.
 */
function registeredTutorToolNames(): TutorToolName[] {
  registerTutorTools();
  return listTools({ module: TUTOR_MODULE_ID }).filter(isTutorToolName);
}

export function getTutorToolDefinitions(): ToolDefinition[] {
  return registeredTutorToolNames()
    .map((name) => getTool(name)?.definition)
    .filter((definition): definition is ToolDefinition => !!definition);
}

export function getTutorToolsByPhase(phase: TutorPhase): TutorToolName[] {
  return registeredTutorToolNames().filter((name) => readExt(name)?.phases.includes(phase));
}

export function getTutorToolsByTag(tag: TutorToolTag): TutorToolName[] {
  return registeredTutorToolNames().filter((name) => readExt(name)?.tags?.[tag]);
}

export function getTutorToolsByPriorityGroup(group: TutorToolPriorityGroup): TutorToolName[] {
  return registeredTutorToolNames().filter((name) => readExt(name)?.priorityGroup === group);
}
