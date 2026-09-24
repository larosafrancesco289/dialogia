// Module: tutor engine learner commands
// Responsibility: `decide` for what the learner does on a card or in the plan, and what approving a plan sets in motion.

import { apply } from '@/modules/tutor/engine/fold';
import { nextReadyNode } from '@/modules/tutor/engine/plan';
import {
  clamp01,
  diagnosticWeight,
  markKnownTarget,
  percent,
  quizWeight,
} from '@/modules/tutor/engine/rules';
import {
  confidenceOf,
  diagnosed,
  quizFinished,
  startingEstimateCap,
  type TutorState,
} from '@/modules/tutor/engine/state';
import {
  err,
  invalid,
  resolveMisconception,
  resolveNode,
  shorten,
  startTopic,
  text,
  type Emitter,
} from '@/modules/tutor/engine/commands/shared';
import type {
  CommandContext,
  LearnerCommand,
  TutorError,
} from '@/modules/tutor/engine/commands/types';

function nodeName(state: TutorState, nodeId: string): string {
  return state.plan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
}

function notEditable(what: string): TutorError {
  return err(
    'not_editable',
    `${what} is not available in this session.`,
    'The study settings turn it off.',
  );
}

export function decideLearner(
  state: TutorState,
  cmd: LearnerCommand,
  ctx: CommandContext,
  out: Emitter,
): TutorError | null {
  const { flags } = ctx;
  switch (cmd.type) {
    case 'answer_intake': {
      const intake = state.intakes[cmd.intakeId];
      if (!intake)
        return err(
          'unknown_card',
          `There is no intake "${cmd.intakeId}".`,
          'Answer the latest intake card.',
        );
      if (intake.responses)
        return err('already_answered', 'This intake was already answered.', 'Nothing to do.');
      if (intake.dismissed) return err('card_closed', 'This intake was closed.', 'Nothing to do.');
      const ids = intake.questions.map((q) => q.id);
      const responses: Record<string, string[]> = {};
      for (const [id, values] of Object.entries(cmd.responses)) {
        if (!ids.includes(id)) {
          return err(
            'unknown_item',
            `There is no question "${id}".`,
            `Valid question ids: ${ids.join(', ')}.`,
          );
        }
        const clean = values.map((v) => text(v)).filter(Boolean);
        if (clean.length) responses[id] = clean;
      }
      if (!Object.keys(responses).length) return invalid('Answer at least one question.');
      out.push({ type: 'intake_answered', intakeId: intake.intakeId, responses });
      return null;
    }

    case 'answer_diagnostic': {
      const diagnostic = state.diagnostics[cmd.diagnosticId];
      if (!diagnostic) {
        return err(
          'unknown_card',
          `There is no diagnostic "${cmd.diagnosticId}".`,
          'Answer the latest diagnostic card.',
        );
      }
      if (diagnostic.answers)
        return err('already_answered', 'This diagnostic was already answered.', 'Nothing to do.');
      if (diagnostic.dismissed)
        return err('card_closed', 'This diagnostic was closed.', 'Nothing to do.');
      const ids = diagnostic.items.map((i) => i.id);
      for (const id of Object.keys(cmd.answers)) {
        if (!ids.includes(id)) {
          return err(
            'unknown_item',
            `There is no item "${id}".`,
            `Valid item ids: ${ids.join(', ')}.`,
          );
        }
      }
      const missing = ids.filter((id) => typeof cmd.answers[id] !== 'number');
      if (missing.length) {
        return err(
          'incomplete_answers',
          `Unanswered: ${missing.join(', ')}.`,
          'Answer every item, then submit.',
        );
      }
      for (const item of diagnostic.items) {
        const choice = cmd.answers[item.id];
        if (!Number.isInteger(choice) || choice < 0 || choice >= item.choices.length) {
          return err(
            'invalid_choice',
            `Item ${item.id} has no choice ${choice}.`,
            `Choose 0 to ${item.choices.length - 1}.`,
          );
        }
      }
      out.push({
        type: 'diagnostic_answered',
        diagnosticId: diagnostic.diagnosticId,
        answers: cmd.answers,
      });
      for (const item of diagnostic.items) {
        if (typeof item.correct !== 'number') continue;
        const target = item.nodeId ?? state.currentNodeId;
        if (!target || !state.mastery[target]) continue;
        const correct = cmd.answers[item.id] === item.correct;
        out.push(
          {
            type: 'evidence_recorded',
            nodeId: target,
            source: 'diagnostic',
            kind: correct ? 'correct_answer' : 'incorrect_answer',
            weight: diagnosticWeight(correct),
            note: `Diagnostic, ${correct ? 'right' : 'wrong'}: "${shorten(item.question)}"`,
            ref: { diagnosticId: diagnostic.diagnosticId, itemId: item.id },
          },
          'system',
        );
      }
      return null;
    }

    case 'answer_quiz_item': {
      const quiz = state.quizzes[cmd.quizId];
      if (!quiz)
        return err(
          'unknown_card',
          `There is no quiz "${cmd.quizId}".`,
          'Answer the latest quiz card.',
        );
      if (quiz.dismissed) return err('card_closed', 'This quiz was closed.', 'Nothing to do.');
      const item = quiz.items.find((i) => i.id === cmd.itemId);
      if (!item) {
        return err(
          'unknown_item',
          `There is no item "${cmd.itemId}" in this quiz.`,
          `Valid item ids: ${quiz.items.map((i) => i.id).join(', ')}.`,
        );
      }
      if (quiz.answers[item.id])
        return err('already_answered', 'This item was already answered.', 'Nothing to do.');
      if (!Number.isInteger(cmd.choice) || cmd.choice < 0 || cmd.choice >= item.choices.length) {
        return err(
          'invalid_choice',
          `There is no choice ${cmd.choice}.`,
          `Choose 0 to ${item.choices.length - 1}.`,
        );
      }
      const correct = cmd.choice === item.correct;
      out.push({
        type: 'quiz_answered',
        quizId: quiz.quizId,
        itemId: item.id,
        choice: cmd.choice,
        correct,
      });
      if (state.mastery[quiz.nodeId]) {
        out.push(
          {
            type: 'evidence_recorded',
            nodeId: quiz.nodeId,
            source: 'quiz',
            kind: correct ? 'correct_answer' : 'incorrect_answer',
            weight: quizWeight(correct),
            note: `Quiz, ${correct ? 'right' : 'wrong'}: "${shorten(item.question)}"`,
            ref: { quizId: quiz.quizId, itemId: item.id },
          },
          'system',
        );
      }
      return null;
    }

    case 'approve_plan': {
      const stale = checkProposal(state, cmd.proposalId);
      if (stale) return stale;
      const approved = out.push({ type: 'plan_approved', proposalId: cmd.proposalId });
      const after = apply(state, approved);
      placeStartingEstimates(state, after, out);
      if (!after.currentNodeId) {
        const next = nextReadyNode(after.plan);
        if (next) out.push({ type: 'topic_started', nodeId: next.id }, 'system');
      }
      return null;
    }

    case 'decline_plan': {
      const stale = checkProposal(state, cmd.proposalId);
      if (stale) return stale;
      if (!flags.planEditable) return notEditable('Declining the plan');
      out.push({
        type: 'plan_declined',
        proposalId: cmd.proposalId,
        ...(text(cmd.feedback) ? { feedback: text(cmd.feedback) } : {}),
      });
      return null;
    }

    case 'start_topic': {
      if (state.phase !== 'teaching' && state.phase !== 'interlude') {
        return err(
          'wrong_phase',
          `A topic cannot be started in the ${state.phase} phase.`,
          state.phase === 'proposal'
            ? 'Approve or decline the pending plan first.'
            : state.phase === 'complete'
              ? 'Every topic is done. Reopen one for more practice.'
              : 'There is no plan yet.',
        );
      }
      if (state.phase === 'teaching' && !flags.planEditable)
        return notEditable('Switching topics mid-topic');
      return startTopic(state, cmd.nodeId, 'learner', out);
    }

    case 'mark_known': {
      if (!flags.planEditable) return notEditable('Marking a topic as known');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      const node = found.node;
      if (node.status === 'completed') {
        return err('topic_completed', `${node.name} is already completed.`, 'Nothing to do.');
      }
      const confidence = confidenceOf(state, node.id);
      const floor = markKnownTarget(confidence);
      if (flags.learnerModelEditable && floor !== confidence) {
        out.push({
          type: 'evidence_recorded',
          nodeId: node.id,
          source: 'learner',
          kind: 'marked_known',
          setTo: floor,
          note: 'Marked as already known.',
        });
      }
      out.push({ type: 'topic_completed', nodeId: node.id, how: 'known' });
      return null;
    }

    case 'skip_topic': {
      if (!flags.planEditable) return notEditable('Skipping a topic');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      if (found.node.status === 'completed') {
        return err('topic_completed', `${found.node.name} is already completed.`, 'Nothing to do.');
      }
      out.push({ type: 'topic_completed', nodeId: found.node.id, how: 'skipped' });
      return null;
    }

    // "Not yet, more practice" at a chapter break and "Take it up again" in
    // Revise are one choice: the topic comes back with its estimate as it
    // stands (asking to practise is not evidence; "Too high" is the learner's
    // way to disagree with a number), and completing it again as mastered
    // needs fresh work, counted from the reopening.
    case 'reopen_topic':
    case 'more_practice': {
      if (!flags.planEditable) return notEditable('Reopening a topic');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      if (found.node.status !== 'completed') {
        return err(
          'topic_not_completed',
          `${found.node.name} is not completed.`,
          'Only a completed topic can be reopened.',
        );
      }
      out.push({ type: 'topic_reopened', nodeId: found.node.id });
      return null;
    }

    case 'adjust_mastery': {
      if (!flags.learnerModelEditable) return notEditable('Correcting the learner model');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      if (!Number.isFinite(cmd.setTo) || cmd.setTo < 0 || cmd.setTo > 1) {
        return invalid('setTo must be between 0 and 1.');
      }
      if (cmd.setTo === confidenceOf(state, found.node.id)) {
        return err(
          'nothing_to_change',
          `${found.node.name} is already at that value.`,
          'Nothing to do.',
        );
      }
      out.push({
        type: 'evidence_recorded',
        nodeId: found.node.id,
        source: 'learner',
        kind: 'adjusted',
        setTo: cmd.setTo,
        note: text(cmd.note) || `Set to ${percent(cmd.setTo)}% by the learner.`,
      });
      return null;
    }

    case 'resolve_misconception':
      if (!flags.learnerModelEditable) return notEditable('Correcting the learner model');
      return resolveMisconception(state, cmd, 'learner', out);

    case 'flag_review': {
      if (!flags.learnerModelEditable) return notEditable('Flagging a topic for review');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      if (!!state.mastery[found.node.id]?.needsReview === cmd.flagged) {
        return err(
          'nothing_to_change',
          `${nodeName(state, found.node.id)} is already ${cmd.flagged ? 'flagged' : 'not flagged'} for review.`,
          'Nothing to do.',
        );
      }
      out.push({ type: 'review_flagged', nodeId: found.node.id, flagged: cmd.flagged });
      return null;
    }

    case 'dismiss_card': {
      const card =
        cmd.card === 'intake'
          ? state.intakes[cmd.cardId]
          : cmd.card === 'diagnostic'
            ? state.diagnostics[cmd.cardId]
            : state.quizzes[cmd.cardId];
      if (!card)
        return err('unknown_card', `There is no ${cmd.card} "${cmd.cardId}".`, 'Nothing to close.');
      if (card.dismissed)
        return err('card_closed', `This ${cmd.card} is already closed.`, 'Nothing to do.');
      const done =
        'responses' in card && card.responses
          ? true
          : 'quizId' in card
            ? quizFinished(card)
            : 'diagnosticId' in card && !!card.answers;
      if (done)
        return err(
          'already_answered',
          `This ${cmd.card} is already answered.`,
          'Nothing to close.',
        );
      out.push({ type: 'card_dismissed', card: cmd.card, cardId: cmd.cardId });
      return null;
    }
  }
}

/**
 * A proposal's starting estimates, as evidence the learner can see, question
 * and contest like any other. Only a topic with no evidence of its own takes
 * one: what the learner has already shown outranks a guess made before.
 */
function placeStartingEstimates(before: TutorState, after: TutorState, out: Emitter): void {
  const estimates = before.proposal?.startingEstimates;
  if (!estimates) return;
  const fromDiagnostic = diagnosed(before);
  for (const [nodeId, estimate] of Object.entries(estimates)) {
    const topic = after.mastery[nodeId];
    if (!topic || topic.evidence.length > 0) continue;
    const setTo = Math.min(startingEstimateCap(before), clamp01(estimate.value));
    if (setTo === topic.confidence) continue;
    const reason = estimate.reason || 'From what the learner said before the plan';
    out.push(
      {
        type: 'evidence_recorded',
        nodeId,
        source: fromDiagnostic ? 'diagnostic' : 'placement',
        kind: 'placement',
        setTo,
        note: fromDiagnostic ? `Starting estimate from the diagnostic: ${reason}` : reason,
      },
      'system',
    );
  }
}

function checkProposal(state: TutorState, proposalId: string): TutorError | null {
  const pending = state.proposal;
  if (!pending) return err('no_proposal', 'There is no plan proposal waiting.', 'Nothing to do.');
  if (pending.proposalId !== proposalId) {
    return err(
      'stale_proposal',
      'That proposal has been replaced by a newer one.',
      `Respond to the latest proposal, "${pending.proposalId}".`,
    );
  }
  return null;
}
