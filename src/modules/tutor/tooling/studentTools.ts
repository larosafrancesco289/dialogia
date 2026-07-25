import {
  applyLearnerModelFeedback,
  getLatestLearnerModel,
  initializeLearnerModel,
  resolvePlanNodeId,
  type LearnerModelFeedback,
} from '@/modules/tutor/learner-model';
import {
  getNextNode,
  processPlanProgress,
  updateNodeStatus,
} from '@/modules/tutor/learning-plan/service';
import type { ToolDefinition } from '@/lib/transport/contracts';
import type { HeadlessTutorSession } from '@/modules/tutor/tooling/session';

const STUDENT_TOOL_NAMES = [
  'adjust_mastery',
  'mark_topic_known',
  'flag_for_review',
  'resolve_misconception',
] as const;
const PLAN_MUTATING_STUDENT_TOOLS = new Set<StudentToolName>(['mark_topic_known']);

export type StudentToolName = (typeof STUDENT_TOOL_NAMES)[number];

export type StudentToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type StudentToolExecutionEvent = {
  turn: number;
  callId: string;
  name: string;
  input: Record<string, unknown>;
  status: 'success' | 'error' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  tutorNotification?: string;
};

const STUDENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'adjust_mastery',
      description:
        'Adjust your mastery/confidence score for a topic when the displayed score does not match your real understanding.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Plan node ID.' },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Target confidence between 0 and 1.',
          },
          reason: { type: 'string', description: 'Optional reason for the adjustment.' },
        },
        required: ['nodeId', 'confidence'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_topic_known',
      description:
        'Mark a topic as already known. This completes the topic, advances the plan, and applies a confidence floor.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Plan node ID.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'flag_for_review',
      description: 'Signal that you need more practice on a topic and lower confidence.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Plan node ID.' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_misconception',
      description: 'Mark a misconception as resolved after understanding the correct concept.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Plan node ID.' },
          misconceptionId: { type: 'string', description: 'Misconception ID to mark resolved.' },
        },
        required: ['nodeId', 'misconceptionId'],
      },
    },
  },
];

export function getStudentToolDefinitions(opts?: { planEditable?: boolean }): ToolDefinition[] {
  const allowPlanMutations = opts?.planEditable !== false;
  return STUDENT_TOOL_DEFINITIONS.filter(
    (definition) =>
      allowPlanMutations ||
      !PLAN_MUTATING_STUDENT_TOOLS.has(definition.function.name as StudentToolName),
  );
}

export function isStudentToolName(name: string): name is StudentToolName {
  return (STUDENT_TOOL_NAMES as readonly string[]).includes(name);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveChatState(session: HeadlessTutorSession, chatId: string) {
  const state = session.getState();
  const chat = state.chats.find((entry) => entry.id === chatId);
  const plan = chat?.settings.features.tutor?.learningPlan;
  if (!chat || !plan) {
    throw new Error(`Missing chat or learning plan for chat ${chatId}`);
  }
  return { state, chat, plan };
}

function getBaseLearnerModel(session: HeadlessTutorSession, chatId: string) {
  const { chat, plan } = resolveChatState(session, chatId);
  const fromMessages = getLatestLearnerModel(session.getMessages());
  const fromSettings = chat.settings.features.tutor?.learnerModel;
  return fromMessages ?? fromSettings ?? initializeLearnerModel(chatId, plan);
}

async function applyFeedbackInSession(opts: {
  session: HeadlessTutorSession;
  chatId: string;
  feedback: LearnerModelFeedback;
  planOverride?: ReturnType<typeof resolveChatState>['plan'];
}) {
  const { session, chatId, feedback, planOverride } = opts;
  const { state, plan } = resolveChatState(session, chatId);
  const workingPlan = planOverride ?? plan;
  const resolvedNodeId = resolvePlanNodeId(workingPlan, feedback.nodeId);
  if (!resolvedNodeId) {
    throw new Error(`Unknown nodeId "${feedback.nodeId}"`);
  }

  const baseModel = getBaseLearnerModel(session, chatId);
  const applied = applyLearnerModelFeedback(baseModel, { ...feedback, nodeId: resolvedNodeId });
  const planResult = await processPlanProgress(workingPlan, applied.model);

  await state.updateChatSettings({
    features: {
      tutor: {
        learningPlan: planResult.updatedPlan,
        learnerModel: applied.model,
      },
    },
  });

  return {
    resolvedNodeId,
    applied,
    updatedPlan: planResult.updatedPlan,
    planUpdates: planResult.planUpdates,
  };
}

async function executeStudentToolCall(opts: {
  session: HeadlessTutorSession;
  chatId: string;
  turn: number;
  call: StudentToolCall;
}): Promise<StudentToolExecutionEvent> {
  const { session, chatId, turn, call } = opts;
  const baseEvent: StudentToolExecutionEvent = {
    turn,
    callId: call.id,
    name: call.name,
    input: call.args,
    status: 'error',
  };

  if (!isStudentToolName(call.name)) {
    return {
      ...baseEvent,
      error: `Unsupported student tool "${call.name}"`,
    };
  }

  try {
    if (call.name === 'adjust_mastery') {
      const nodeId = asString(call.args.nodeId);
      const confidence = asNumber(call.args.confidence);
      const reason = asString(call.args.reason);
      if (!nodeId || confidence == null) {
        throw new Error('adjust_mastery requires nodeId and confidence');
      }
      const capped = clamp(confidence, 0, 1);
      const applied = await applyFeedbackInSession({
        session,
        chatId,
        feedback: { nodeId, estimatedConfidence: capped, reason },
      });
      return {
        ...baseEvent,
        status: 'success',
        output: {
          nodeId: applied.resolvedNodeId,
          from: applied.applied.from,
          to: applied.applied.to,
        },
      };
    }

    if (call.name === 'mark_topic_known') {
      const nodeId = asString(call.args.nodeId);
      if (!nodeId) throw new Error('mark_topic_known requires nodeId');
      const { plan } = resolveChatState(session, chatId);
      const resolvedNodeId = resolvePlanNodeId(plan, nodeId);
      if (!resolvedNodeId) throw new Error(`Unknown nodeId "${nodeId}"`);
      const resolvedNode = plan.nodes.find((node) => node.id === resolvedNodeId);
      if (!resolvedNode) throw new Error(`Node not found for "${resolvedNodeId}"`);

      let updatedPlan = updateNodeStatus(plan, resolvedNodeId, 'completed');
      const nextNode = getNextNode(updatedPlan);
      if (nextNode && nextNode.status === 'not_started') {
        updatedPlan = updateNodeStatus(updatedPlan, nextNode.id, 'in_progress');
      }

      const feedback = await applyFeedbackInSession({
        session,
        chatId,
        planOverride: updatedPlan,
        feedback: {
          nodeId: resolvedNodeId,
          confidenceFloor: 0.7,
          reason: `Student marked "${resolvedNode.name}" as already known`,
        },
      });
      const tutorNotification = `I already know the topic "${resolvedNode.name}". Please skip teaching this and move to the next topic.`;
      return {
        ...baseEvent,
        status: 'success',
        tutorNotification,
        output: {
          nodeId: feedback.resolvedNodeId,
          nextNodeId: getNextNode(feedback.updatedPlan)?.id,
          confidenceFloor: 0.7,
        },
      };
    }

    if (call.name === 'flag_for_review') {
      const nodeId = asString(call.args.nodeId);
      if (!nodeId) throw new Error('flag_for_review requires nodeId');
      const applied = await applyFeedbackInSession({
        session,
        chatId,
        feedback: {
          nodeId,
          direction: 'down',
          reason: 'I flagged this topic for review.',
        },
      });
      return {
        ...baseEvent,
        status: 'success',
        output: {
          nodeId: applied.resolvedNodeId,
          from: applied.applied.from,
          to: applied.applied.to,
        },
      };
    }

    const nodeId = asString(call.args.nodeId);
    const misconceptionId = asString(call.args.misconceptionId);
    if (!nodeId || !misconceptionId) {
      throw new Error('resolve_misconception requires nodeId and misconceptionId');
    }
    const applied = await applyFeedbackInSession({
      session,
      chatId,
      feedback: {
        nodeId,
        misconceptionId,
        reason: 'I believe I have resolved this misconception.',
      },
    });
    return {
      ...baseEvent,
      status: 'success',
      output: {
        nodeId: applied.resolvedNodeId,
        misconceptionId,
        resolved: applied.applied.resolved ?? [],
      },
    };
  } catch (error) {
    return {
      ...baseEvent,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function executeStudentToolCalls(opts: {
  session: HeadlessTutorSession;
  chatId: string;
  turn: number;
  calls: StudentToolCall[];
  learnerModelEditable: boolean;
  planEditable: boolean;
}): Promise<StudentToolExecutionEvent[]> {
  const { session, chatId, turn, calls, learnerModelEditable, planEditable } = opts;
  if (calls.length === 0) return [];

  if (!learnerModelEditable) {
    return calls.map((call) => ({
      turn,
      callId: call.id,
      name: call.name,
      input: call.args,
      status: 'skipped',
      error: 'Learner model is not editable in this condition',
    }));
  }

  const results: StudentToolExecutionEvent[] = [];
  for (const call of calls) {
    if (!planEditable && PLAN_MUTATING_STUDENT_TOOLS.has(call.name as StudentToolName)) {
      results.push({
        turn,
        callId: call.id,
        name: call.name,
        input: call.args,
        status: 'skipped',
        error: 'Plan editability is disabled in this condition',
      });
      continue;
    }
    results.push(
      await executeStudentToolCall({
        session,
        chatId,
        turn,
        call,
      }),
    );
  }
  return results;
}
