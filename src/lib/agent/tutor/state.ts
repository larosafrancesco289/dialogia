import type { TutorToolName } from '@/lib/agent/types';
import type { UIState } from '@/lib/store/types';
import type { Chat, Message, MessageTutor } from '@/lib/types';

export type TutorPhase =
  | 'intake'
  | 'diagnostic'
  | 'planning'
  | 'teaching'
  | 'practice'
  | 'review';

function latestTutorPayload(
  messages: Message[],
  ui?: UIState,
): MessageTutor | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    if (msg.tutor) return msg.tutor;
    const uiTutor = ui?.tutorByMessageId?.[msg.id];
    if (uiTutor) return uiTutor;
  }
  return undefined;
}

export function getTutorPhase(
  chat: Chat,
  messages: Message[],
  ui?: UIState,
): TutorPhase {
  const plan = chat.settings.learningPlan;
  const tutor = latestTutorPayload(messages, ui);

  if (!plan) {
    if (tutor?.diagnostic && tutor.diagnostic.status !== 'completed') return 'diagnostic';
    if (tutor?.planProposal && tutor.planProposal.status === 'pending') return 'planning';
    if (tutor?.questionnaire && tutor.questionnaire.status !== 'submitted') return 'intake';
    return 'intake';
  }

  const activeNode = plan.nodes.some((node) => node.status === 'in_progress');
  const completedCount = plan.nodes.filter((node) => node.status === 'completed').length;
  const hasPracticeWidget =
    (tutor?.mcq && tutor.mcq.length > 0) ||
    (tutor?.fillBlank && tutor.fillBlank.length > 0) ||
    (tutor?.openEnded && tutor.openEnded.length > 0) ||
    (tutor?.flashcards && tutor.flashcards.length > 0);

  if (!activeNode) {
    if (completedCount > 0 && completedCount === plan.nodes.length) return 'review';
    if (tutor?.planProposal && tutor.planProposal.status === 'pending') return 'planning';
    if (tutor?.diagnostic && tutor.diagnostic.status !== 'completed') return 'diagnostic';
    return 'planning';
  }

  if (tutor?.diagnostic && tutor.diagnostic.status !== 'completed') return 'diagnostic';
  if (hasPracticeWidget) return 'practice';
  if (completedCount > 0 && completedCount === plan.nodes.length) return 'review';
  return 'teaching';
}

export function allowedTutorToolsForPhase(phase: TutorPhase): TutorToolName[] {
  switch (phase) {
    case 'intake':
      return ['ask_student_question', 'create_diagnostic', 'generate_plan'];
    case 'diagnostic':
      return [
        'create_diagnostic',
        'quiz_mcq',
        'quiz_fill_blank',
        'assess_answer',
        'update_learner_model',
      ];
    case 'planning':
      return ['generate_plan', 'update_plan', 'get_plan_suggestions'];
    case 'practice':
      return [
        'quiz_mcq',
        'quiz_fill_blank',
        'quiz_open_ended',
        'flashcards',
        'assess_answer',
        'grade_open_response',
        'update_learner_model',
        'add_to_deck',
      ];
    case 'review':
      return ['flashcards', 'srs_review', 'assess_answer', 'update_learner_model'];
    case 'teaching':
    default:
      return [
        'quiz_mcq',
        'quiz_fill_blank',
        'quiz_open_ended',
        'flashcards',
        'assess_answer',
        'grade_open_response',
        'update_learner_model',
        'add_to_deck',
      ];
  }
}

export function isTutorToolAllowedInPhase(name: TutorToolName, phase: TutorPhase): boolean {
  return allowedTutorToolsForPhase(phase).includes(name);
}
