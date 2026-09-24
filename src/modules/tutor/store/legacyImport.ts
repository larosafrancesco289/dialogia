// Module: tutor store legacyImport
// Responsibility: turn a chat's pre-event-log tutor data into events, once. Pure: the
// slice decides when it runs (a chat's first load with an empty log) and persists the result.

import type {
  Chat,
  LearnerModel,
  LearningPlan,
  Message,
  MessageTutor,
  TutorDiagnosticItem,
  TutorMCQItem,
} from '@/lib/types';
import {
  parseTutorEvent,
  type CardKind,
  type TutorEvent,
  type TutorEventDraft,
} from '@/modules/tutor/engine';

export type LegacyImportInput = {
  chat: Chat;
  /** The chat's messages, any order. */
  messages: Message[];
  at: number;
  newId: () => string;
};

type Stamped = { draft: TutorEventDraft; by: TutorEvent['by']; messageId?: string };

const legacyId = (kind: string, messageId: string) => `legacy-${kind}-${messageId}`;

/** The newer of the chat's own copy and the latest per-message snapshot. */
function newestLearnerModel(chat: Chat, assistants: Message[]): LearnerModel | undefined {
  const chatCopy = chat.settings.features.tutor?.learnerModel;
  const snapshot = [...assistants].reverse().find((m) => m.learnerModel)?.learnerModel;
  if (!chatCopy) return snapshot;
  if (!snapshot) return chatCopy;
  return (snapshot.updatedAt ?? 0) > (chatCopy.updatedAt ?? 0) ? snapshot : chatCopy;
}

function quizItems(items: TutorMCQItem[]) {
  return items
    .filter((item) => item && typeof item.id === 'string' && Array.isArray(item.choices))
    .filter((item) => Number.isInteger(item.correct) && item.correct >= 0)
    .map((item) => ({
      id: item.id,
      question: String(item.question ?? ''),
      choices: item.choices.map(String),
      correct: item.correct,
      ...(item.explanation ? { explanation: item.explanation } : {}),
    }));
}

function diagnosticItems(items: TutorDiagnosticItem[]) {
  return items
    .filter((item) => item && typeof item.id === 'string' && Array.isArray(item.choices))
    .map((item) => ({
      id: item.id,
      question: String(item.question ?? ''),
      choices: item.choices.map(String),
      ...(Number.isInteger(item.correct) && (item.correct as number) >= 0
        ? { correct: item.correct as number }
        : {}),
      ...(item.explanation ? { explanation: item.explanation } : {}),
    }));
}

/** The events one legacy message's cards stand for, with whether each card was left open. */
function cardEvents(
  message: Message,
  tutor: MessageTutor,
  currentNodeId: string,
): { events: Stamped[]; open: Array<{ card: CardKind; cardId: string }> } {
  const events: Stamped[] = [];
  const open: Array<{ card: CardKind; cardId: string }> = [];
  const messageId = message.id;
  const attempts = tutor.attempts?.mcq ?? {};
  const push = (draft: TutorEventDraft, by: TutorEvent['by']) =>
    events.push({ draft, by, messageId });

  const questionnaire = tutor.questionnaire;
  if (questionnaire?.questions?.length) {
    const intakeId = legacyId('intake', messageId);
    push(
      {
        type: 'intake_asked',
        intakeId,
        ...(tutor.title ? { title: tutor.title } : {}),
        questions: questionnaire.questions.map((q) => ({
          id: q.id,
          question: q.question,
          ...(q.category ? { category: q.category } : {}),
          ...(q.allowMultiple ? { allowMultiple: true } : {}),
          options: (q.options ?? []).map((o) => ({
            label: o.label,
            ...(o.description ? { description: o.description } : {}),
          })),
        })),
      },
      'tutor',
    );
    if (questionnaire.status === 'submitted' && questionnaire.responses) {
      push({ type: 'intake_answered', intakeId, responses: questionnaire.responses }, 'learner');
    } else {
      open.push({ card: 'intake', cardId: intakeId });
    }
  }

  const diagnostic = tutor.diagnostic;
  const diagnosticIds = new Set<string>();
  if (diagnostic?.items?.length) {
    const diagnosticId = diagnostic.diagnosticId || legacyId('diagnostic', messageId);
    const items = diagnosticItems(diagnostic.items);
    items.forEach((item) => diagnosticIds.add(item.id));
    push({ type: 'diagnostic_given', diagnosticId, topic: diagnostic.topic ?? '', items }, 'tutor');
    const answers: Record<string, number> = {};
    for (const item of items) {
      const choice = attempts[item.id]?.choice;
      if (attempts[item.id]?.done && Number.isInteger(choice)) answers[item.id] = choice as number;
    }
    const finished = diagnostic.status === 'completed' || items.every((item) => item.id in answers);
    if (finished) push({ type: 'diagnostic_answered', diagnosticId, answers }, 'learner');
    else open.push({ card: 'diagnostic', cardId: diagnosticId });
  }

  const mcq = (tutor.mcq ?? []).filter((item) => !diagnosticIds.has(item?.id));
  const items = quizItems(mcq);
  if (items.length) {
    const quizId = legacyId('quiz', messageId);
    push(
      {
        type: 'quiz_given',
        quizId,
        nodeId: currentNodeId,
        ...(tutor.title ? { title: tutor.title } : {}),
        items,
      },
      'tutor',
    );
    let answered = 0;
    for (const item of items) {
      const attempt = attempts[item.id];
      if (!attempt?.done || !Number.isInteger(attempt.choice)) continue;
      answered += 1;
      push(
        {
          type: 'quiz_answered',
          quizId,
          itemId: item.id,
          choice: attempt.choice as number,
          correct: attempt.choice === item.correct,
        },
        'learner',
      );
    }
    if (answered < items.length) open.push({ card: 'quiz', cardId: quizId });
  }

  return { events, open };
}

/**
 * A proposal the learner already answered, or one a later proposal replaced,
 * as history its message can render. The pending one is the import's own.
 */
function resolvedProposal(
  message: Message,
  tutor: MessageTutor,
  pendingMessageId: string | undefined,
): Stamped | undefined {
  const proposal = tutor.planProposal;
  if (!proposal?.plan?.nodes?.length || message.id === pendingMessageId) return undefined;
  const status = proposal.status === 'pending' ? 'replaced' : proposal.status;
  return {
    draft: {
      type: 'proposal_imported',
      proposalId: legacyId('proposal', message.id),
      plan: proposal.plan,
      ...(proposal.confirmationMessage ? { rationale: proposal.confirmationMessage } : {}),
      status,
    },
    by: 'system',
    messageId: message.id,
  };
}

/** The latest proposal in the transcript, if the learner never answered it. */
function pendingProposal(
  assistants: Message[],
): { messageId: string; plan: LearningPlan; rationale?: string } | undefined {
  const latest = [...assistants].reverse().find((m) => m.tutor?.planProposal);
  const proposal = latest?.tutor?.planProposal;
  if (!latest || !proposal || proposal.status !== 'pending') return undefined;
  if (!proposal.plan?.nodes?.length) return undefined;
  return {
    messageId: latest.id,
    plan: proposal.plan,
    ...(proposal.confirmationMessage ? { rationale: proposal.confirmationMessage } : {}),
  };
}

/**
 * The events that stand for a chat's legacy tutor data, or none when it has
 * none. Cards come first, one message at a time, carrying their message id so
 * old transcripts render them from events; a proposal still waiting comes back
 * as a `plan_proposed` on its message; the `legacy_imported` event (plan and
 * learner model, on no message) comes last, so its position marks where
 * imported history ends. Answered and replaced proposals come back as
 * history, so old plan cards still render.
 * Answers to old quizzes and diagnostics add no evidence: the imported
 * learner model already counts them, and the old quizzes spend no budget. Cards left unanswered before the last reply are closed, so an
 * abandoned card cannot hold the session open.
 */
export function buildLegacyImport({ chat, messages, at, newId }: LegacyImportInput): TutorEvent[] {
  const settings = chat.settings.features.tutor;
  const assistants = messages
    .filter((m) => m.role === 'assistant')
    .sort((a, b) => a.createdAt - b.createdAt);
  const plan = settings?.learningPlan;
  const learnerModel = newestLearnerModel(chat, assistants);
  const proposal = pendingProposal(assistants);
  const currentNodeId =
    plan?.nodes.find((n) => n.status === 'in_progress')?.id ?? plan?.nodes[0]?.id ?? 'legacy';
  const lastAssistantId = assistants.at(-1)?.id;

  const stamped: Stamped[] = [];
  for (const message of assistants) {
    if (!message.tutor) continue;
    const history = resolvedProposal(message, message.tutor, proposal?.messageId);
    if (history) stamped.push(history);
    const { events, open } = cardEvents(message, message.tutor, currentNodeId);
    stamped.push(...events);
    if (message.id === lastAssistantId) continue;
    for (const card of open) {
      stamped.push({ draft: { type: 'card_dismissed', ...card }, by: 'system' });
    }
  }

  if (!stamped.length && !plan && !learnerModel && !proposal) return [];

  let seq = 0;
  const stamp = ({ draft, by, messageId }: Stamped): TutorEvent | undefined =>
    parseTutorEvent({
      ...draft,
      id: newId(),
      chatId: chat.id,
      seq: seq + 1,
      at,
      by,
      ...(messageId ? { messageId } : {}),
    });

  const out: TutorEvent[] = [];
  for (const entry of stamped) {
    const event = stamp(entry);
    if (!event) continue;
    seq += 1;
    out.push(event);
  }

  // Each part is checked on its own, so one malformed record (an old learner
  // model, say) does not cost the learner their plan.
  const valid = (part: Record<string, unknown>) =>
    !!parseTutorEvent({
      type: 'legacy_imported',
      id: 'check',
      chatId: chat.id,
      seq: 1,
      at,
      by: 'system',
      ...part,
    });
  const importedPlan = plan && valid({ plan }) ? plan : undefined;
  const importedModel = learnerModel && valid({ learnerModel }) ? learnerModel : undefined;

  // The pending proposal belongs to its reply, so regenerating that reply
  // takes back the proposal alone; the plan and mastery below belong to no
  // reply and survive it.
  if (proposal) {
    const event = stamp({
      draft: {
        type: 'plan_proposed',
        proposalId: legacyId('proposal', proposal.messageId),
        plan: proposal.plan,
        ...(proposal.rationale ? { rationale: proposal.rationale } : {}),
        revision: !!importedPlan,
      },
      by: 'system',
      messageId: proposal.messageId,
    });
    if (event) {
      seq += 1;
      out.push(event);
    }
  }

  const imported = stamp({
    draft: {
      type: 'legacy_imported',
      ...(importedPlan ? { plan: importedPlan } : {}),
      ...(importedModel ? { learnerModel: importedModel } : {}),
    },
    by: 'system',
  });
  if (imported) out.push(imported);
  return out;
}
