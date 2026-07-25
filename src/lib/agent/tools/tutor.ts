import type { Chat, LearningPlan, Message } from '@/lib/types';
import type { TurnStoreState } from '@/lib/agent/contracts';
import type { PersistMessage, StoreGetter, StoreSetter } from '@/lib/agent/types';
import { attachTutorUiState } from '@/lib/agent/tutorFlow';
import { getNextNode } from '@/lib/learning-plan/service';
import { getTutorToolsByTag, type TutorToolName } from '@/lib/agent/tools/tutor/register';
import { getMessagesForChat, setMessagesForChat } from '@/lib/messages/indexing';
import type {
  TutorToolApplyResult,
  TutorToolContext,
  TutorToolHandler,
} from '@/lib/agent/tools/tutor/types';
import {
  advanceTopicHandler,
  askStudentQuestionHandler,
  createDiagnosticHandler,
  learningPlanHandler,
  quizHandler,
  recordLearningHandler,
} from '@/lib/agent/tools/tutor/handlers';

export { normalizeTutorQuizPayload, type TutorQuizPayload } from '@/lib/agent/tools/tutor/shared';
export { isTutorToolName } from '@/lib/agent/tools/tutor/register';

const quizTools = () => new Set<TutorToolName>(getTutorToolsByTag('quiz'));

export function recordTutorToolUsage(opts: {
  set: StoreSetter;
  chatId: string;
  assistantMessageId: string;
  plan?: LearningPlan | null;
  name: TutorToolName;
}) {
  const { set, chatId, assistantMessageId, plan, name } = opts;
  set((state) => {
    const usageByChat = state.ui.tutor?.toolUsageByChatId || {};
    const prev = usageByChat[chatId] || {};
    const sameTurn = prev.lastMessageId === assistantMessageId;
    const activeNodeId = plan ? (getNextNode(plan)?.id ?? '__global__') : '__global__';
    const nextUsage = {
      ...prev,
      lastMessageId: assistantMessageId,
      toolsThisTurn: (sameTurn ? prev.toolsThisTurn || 0 : 0) + 1,
      mcqByNode: { ...(prev.mcqByNode || {}) },
    };

    if (quizTools().has(name)) {
      nextUsage.mcqByNode[activeNodeId] = (nextUsage.mcqByNode[activeNodeId] || 0) + 1;
    }
    if (name === 'create_diagnostic') {
      nextUsage.diagnosticsUsed = (nextUsage.diagnosticsUsed ?? 0) + 1;
    }

    return {
      ui: {
        ...state.ui,
        tutor: {
          ...state.ui.tutor,
          toolUsageByChatId: { ...usageByChat, [chatId]: nextUsage },
        },
      },
    } as Partial<TurnStoreState>;
  });
}

type AnyTutorToolHandler = TutorToolHandler<unknown>;

const tutorToolHandlers: Record<TutorToolName, AnyTutorToolHandler> = {
  ask_student_question: askStudentQuestionHandler as AnyTutorToolHandler,
  create_diagnostic: createDiagnosticHandler as AnyTutorToolHandler,
  learning_plan: learningPlanHandler as AnyTutorToolHandler,
  record_learning: recordLearningHandler as AnyTutorToolHandler,
  advance_topic: advanceTopicHandler as AnyTutorToolHandler,
  quiz: quizHandler as AnyTutorToolHandler,
};

const summarizeArgKeys = (args: Record<string, unknown>): string => {
  const keys = Object.keys(args);
  return keys.length > 0 ? keys.join(', ') : '(none)';
};

const invalidArgsError = (name: TutorToolName, args: Record<string, unknown>): string => {
  const keySummary = summarizeArgKeys(args);
  if (name === 'quiz') {
    return `Invalid arguments for quiz. Required shape: { type: "mcq"|"fill_blank"|"open_ended", items: [...] }. Received keys: ${keySummary}.`;
  }
  return `Invalid arguments for ${name}. Received keys: ${keySummary}.`;
};

export async function applyTutorToolCall(opts: {
  name: TutorToolName;
  args: Record<string, unknown>;
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: PersistMessage;
  getCurrentPlan?: () => LearningPlan | undefined;
}): Promise<TutorToolApplyResult> {
  const { name, args, chat, chatId, assistantMessage, set, get, persistMessage, getCurrentPlan } =
    opts;

  const applyTutorPatch: TutorToolContext['applyTutorPatch'] = async (buildPatch) => {
    let updatedMsg: Message | undefined;
    set((state) => {
      const list = getMessagesForChat(state, chatId);
      const prev =
        ((state.ui.tutor?.byMessageId || {})[assistantMessage.id] as Record<string, unknown>) || {};
      const patch = buildPatch(prev);
      const result = attachTutorUiState({
        currentUi: state.ui.tutor?.byMessageId,
        currentMessages: list,
        messageId: assistantMessage.id,
        patch,
      });
      if (result.updatedMessage) updatedMsg = result.updatedMessage;
      return {
        ui: {
          ...state.ui,
          tutor: {
            ...state.ui.tutor,
            byMessageId: result.nextUi,
          },
        },
        ...setMessagesForChat(state, chatId, result.nextMessages),
      } as Partial<TurnStoreState>;
    });
    if (updatedMsg) {
      await persistMessage(updatedMsg).catch(() => undefined);
    }
    return updatedMsg;
  };

  const handler = tutorToolHandlers[name];
  if (!handler) {
    return {
      handled: false,
      usedContent: false,
      error: `Unsupported tutor tool: ${name}`,
    };
  }
  const parsed = handler.parseArgs(args);
  if (!parsed) {
    return {
      handled: false,
      usedContent: false,
      error: invalidArgsError(name, args),
    };
  }

  const currentMessageTutor: TutorToolContext['currentMessageTutor'] = () => {
    const state = get();
    return state?.ui?.tutor?.byMessageId?.[assistantMessage.id] as
      | import('@/lib/types').MessageTutor
      | undefined;
  };

  const context: TutorToolContext = {
    chat,
    chatId,
    assistantMessage,
    set,
    get,
    persistMessage,
    applyTutorPatch,
    getCurrentPlan,
    currentMessageTutor,
  };

  const result: TutorToolApplyResult = await handler.apply(context, parsed);
  return result;
}
