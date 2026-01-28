import type { Chat, LearningPlan, Message } from '@/lib/types';
import type { TurnStoreState } from '@/lib/agent/contracts';
import { TUTOR_TOOL_NAMES } from '@/lib/agent/types';
import type { PersistMessage, StoreGetter, StoreSetter, TutorToolName } from '@/lib/agent/types';
import { attachTutorUiState } from '@/lib/agent/tutorFlow';
import { getNextNode } from '@/lib/learningPlan/service';
import { getTutorToolsByTag } from '@/lib/agent/tools/metadata';
import { getMessagesForChat, setMessagesForChat } from '@/lib/messages/indexing';
import type {
  TutorToolApplyResult,
  TutorToolContext,
  TutorToolHandler,
} from '@/lib/agent/tools/tutor/types';
import {
  addToDeckHandler,
  advanceTopicHandler,
  applyLearnerModelFeedbackHandler,
  assessAnswerHandler,
  askStudentQuestionHandler,
  createDiagnosticHandler,
  flashcardsHandler,
  generatePlanHandler,
  getPlanSuggestionsHandler,
  gradeOpenResponseHandler,
  quizFillBlankHandler,
  quizMcqHandler,
  quizOpenEndedHandler,
  srsReviewHandler,
  updateLearnerModelHandler,
  updatePlanHandler,
} from '@/lib/agent/tools/tutor/handlers';

export { normalizeTutorQuizPayload, type TutorQuizPayload } from '@/lib/agent/tools/tutor/shared';

const TUTOR_TOOL_NAME_SET = new Set<TutorToolName>(TUTOR_TOOL_NAMES);

const QUIZ_TOOLS = new Set<TutorToolName>(getTutorToolsByTag('quiz'));

export function recordTutorToolUsage(opts: {
  set: StoreSetter;
  chatId: string;
  assistantMessageId: string;
  plan?: LearningPlan | null;
  name: TutorToolName;
}) {
  const { set, chatId, assistantMessageId, plan, name } = opts;
  set((state) => {
    const usageByChat = state.ui.tutor.toolUsageByChatId || {};
    const prev = usageByChat[chatId] || {};
    const sameTurn = prev.lastMessageId === assistantMessageId;
    const activeNodeId = plan ? (getNextNode(plan)?.id ?? '__global__') : '__global__';
    const nextUsage = {
      ...prev,
      lastMessageId: assistantMessageId,
      toolsThisTurn: (sameTurn ? prev.toolsThisTurn || 0 : 0) + 1,
      mcqByNode: { ...(prev.mcqByNode || {}) },
    };

    if (QUIZ_TOOLS.has(name)) {
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

export function isTutorToolName(name: string): name is TutorToolName {
  return TUTOR_TOOL_NAME_SET.has(name as TutorToolName);
}

type AnyTutorToolHandler = TutorToolHandler<unknown>;

const tutorToolHandlers: Record<TutorToolName, AnyTutorToolHandler> = {
  ask_student_question: askStudentQuestionHandler as AnyTutorToolHandler,
  create_diagnostic: createDiagnosticHandler as AnyTutorToolHandler,
  generate_plan: generatePlanHandler as AnyTutorToolHandler,
  update_plan: updatePlanHandler as AnyTutorToolHandler,
  assess_answer: assessAnswerHandler as AnyTutorToolHandler,
  update_learner_model: updateLearnerModelHandler as AnyTutorToolHandler,
  advance_topic: advanceTopicHandler as AnyTutorToolHandler,
  apply_learner_model_feedback: applyLearnerModelFeedbackHandler as AnyTutorToolHandler,
  get_plan_suggestions: getPlanSuggestionsHandler as AnyTutorToolHandler,
  quiz_mcq: quizMcqHandler as AnyTutorToolHandler,
  quiz_fill_blank: quizFillBlankHandler as AnyTutorToolHandler,
  quiz_open_ended: quizOpenEndedHandler as AnyTutorToolHandler,
  flashcards: flashcardsHandler as AnyTutorToolHandler,
  grade_open_response: gradeOpenResponseHandler as AnyTutorToolHandler,
  add_to_deck: addToDeckHandler as AnyTutorToolHandler,
  srs_review: srsReviewHandler as AnyTutorToolHandler,
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
        ((state.ui.tutor.byMessageId || {})[assistantMessage.id] as Record<string, unknown>) || {};
      const patch = buildPatch(prev);
      const result = attachTutorUiState({
        currentUi: state.ui.tutor.byMessageId,
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
  if (!handler) return { handled: false, usedContent: false };
  const parsed = handler.parseArgs(args);
  if (!parsed) return { handled: false, usedContent: false };

  const context: TutorToolContext = {
    chat,
    chatId,
    assistantMessage,
    set,
    get,
    persistMessage,
    applyTutorPatch,
    getCurrentPlan,
  };

  const result: TutorToolApplyResult = await handler.apply(context, parsed);
  return result;
}
