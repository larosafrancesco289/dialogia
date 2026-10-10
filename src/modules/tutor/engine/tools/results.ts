// Module: tutor engine tool results
// Responsibility: what the model reads back after a tool call: compact state after success, the structured error after a refusal, and a card's introduction round.

import type { TutorError, TutorToolCommand, TutorToolName } from '@/modules/tutor/engine/commands';
import type { TutorEvent, TutorEventOf } from '@/modules/tutor/engine/events';
import { nextReadyNode } from '@/modules/tutor/engine/plan';
import {
  STARTING_ESTIMATE_MAX,
  STARTING_ESTIMATE_SAID_MAX,
  masteryBand,
  percent,
} from '@/modules/tutor/engine/rules';
import {
  confidenceOf,
  diagnosed,
  remainingBudgets,
  replyRecord,
  type TutorState,
} from '@/modules/tutor/engine/state';
import { TOOL_ENDS_TURN } from '@/modules/tutor/engine/tools/definitions';

const CARD_NAMES: Partial<Record<TutorToolName, string>> = {
  ask_intake: 'Your intake questions are',
  give_diagnostic: 'Your diagnostic is',
  give_quiz: 'Your quiz is',
  propose_plan: 'Your plan proposal is',
};

/**
 * What a card's call reads when the tutor put it up without writing a word:
 * the turn gets one more round, without tools, for the introduction every
 * card needs. Only cards (tools that end the turn) have one.
 */
export function cardIntroduction(name: TutorToolName, result: ToolResult): ToolResult | undefined {
  const card = CARD_NAMES[name];
  if (!card || !TOOL_ENDS_TURN[name]) return undefined;
  return {
    ...result,
    note: `${card} on the learner's screen now, below your reply, but you have not written anything this turn. Write one or two sentences introducing it: what it is for and what to do with it. Do not call tools, and do not repeat its questions or hint at answers.`,
  };
}

export type ToolResult = Record<string, unknown>;

export function tutorToolError(error: TutorError): ToolResult {
  return { ok: false, error: error.code, message: error.message, hint: error.hint };
}

/**
 * A result with what parsing ignored or corrected, so the model knows what
 * did not count, ahead of anything the engine itself set aside.
 */
export function withAdjustments(result: ToolResult, adjusted: readonly string[] | undefined) {
  if (!adjusted?.length) return result;
  const engine = Array.isArray(result.adjusted) ? result.adjusted : [];
  return { ...result, adjusted: [...adjusted, ...engine] };
}

/** Why an observation moved nothing, for the tutor to learn from. */
function noGainReason(before: TutorState, event: TutorEventOf<'evidence_recorded'>): string {
  if (replyRecord(before, event.messageId)?.misconceptions.includes(event.nodeId)) {
    return `No gain: you noted a misconception on ${event.nodeId} in this reply that their latest answer showed, and an answer that shows a misconception earns nothing on its topic. Record a wrong answer as struggled.`;
  }
  return 'No gain: a partly right answer you led them to shows nothing of their own yet.';
}

function topicSummary(state: TutorState, id: string) {
  const confidence = confidenceOf(state, id);
  return { id, mastery: percent(confidence), band: masteryBand(confidence) };
}

/**
 * What the model reads back after a successful call: the state it needs to
 * carry on, never an answer key.
 */
export function tutorToolResult(
  name: TutorToolName,
  before: TutorState,
  after: TutorState,
  events: readonly TutorEvent[],
  command?: TutorToolCommand,
): ToolResult {
  const event = events[0];
  switch (name) {
    case 'ask_intake':
      return {
        ok: true,
        shown: 'intake',
        note: 'The learner sees your questions. Wait for their answers.',
      };
    case 'give_diagnostic':
      return {
        ok: true,
        shown: 'diagnostic',
        diagnosticsLeft: remainingBudgets(after).diagnosticsLeft,
        note: 'The learner sees the diagnostic. The engine scores it when they submit.',
      };
    case 'give_quiz': {
      const given = event?.type === 'quiz_given' ? event : undefined;
      if (given?.review) {
        return {
          ok: true,
          shown: 'quiz',
          topic: given.nodeId,
          refresher: true,
          note: 'The learner sees the refresher. The engine grades each answer; the topic stays done.',
        };
      }
      return {
        ok: true,
        shown: 'quiz',
        topic: after.currentNodeId,
        quizzesLeft: remainingBudgets(after).quizzesLeft,
        note: 'The learner sees the quiz. The engine grades each answer.',
      };
    }
    case 'propose_plan': {
      const proposal = after.proposal;
      const previous = new Set(before.plan?.nodes.map((n) => n.id) ?? []);
      const ids = proposal?.plan.nodes.map((n) => n.id) ?? [];
      const carried = proposal?.carriedOver ?? {};
      // The proposal's topics are the call's, in order.
      const carriedAlready = (from: { chatId: string; topic: string }) =>
        Object.values(carried).some(
          (source) =>
            source.chatId === from.chatId &&
            source.topic.trim().toLowerCase() === from.topic.trim().toLowerCase(),
        );
      const dropped =
        command?.type === 'propose_plan'
          ? command.nodes.flatMap(({ carriedFrom: from }, i) =>
              from && !carried[ids[i]]
                ? [
                    carriedAlready(from)
                      ? `ignored topics.${i}.carriedFrom: "${from.topic}" already carries over to an earlier topic here, and one earlier topic carries to one topic; it starts like any other topic`
                      : `ignored topics.${i}.carriedFrom: no topic "${from.topic}" with an estimate in the tutor chat [${from.chatId}]; it starts like any other topic`,
                  ]
                : [],
            )
          : [];
      return {
        ok: true,
        shown: 'plan_proposal',
        revision: proposal?.revision ?? false,
        topics: ids,
        ...(previous.size ? { keepsProgressFor: ids.filter((id) => previous.has(id)) } : {}),
        ...(proposal?.startingEstimates
          ? {
              startingEstimates: Object.fromEntries(
                Object.entries(proposal.startingEstimates).map(([id, e]) => [id, percent(e.value)]),
              ),
              ...(diagnosed(before)
                ? {}
                : {
                    startingEstimatesNote: `With no diagnostic, a starting estimate rests on what the learner said and goes no higher than ${percent(STARTING_ESTIMATE_SAID_MAX)}%.`,
                  }),
            }
          : {}),
        ...(Object.keys(carried).length
          ? {
              carriedOver: Object.fromEntries(
                Object.entries(carried).map(([id, source]) => [id, source.topic]),
              ),
              carriedOverNote: `On approval each carried-over topic starts from its estimate in the other chat, up to ${percent(STARTING_ESTIMATE_MAX)}%. Completing it still needs the learner's own answers here.`,
            }
          : {}),
        ...(dropped.length ? { adjusted: dropped } : {}),
        ...closedCard(events),
        note: 'The learner sees the proposal and will approve or decline it.',
      };
    }
    case 'record_evidence': {
      if (event?.type !== 'evidence_recorded') return { ok: true };
      const nodeId = event.nodeId;
      return {
        ok: true,
        ...topicSummary(after, nodeId),
        was: percent(confidenceOf(before, nodeId)),
        ...(event.weight === 0 ? { note: noGainReason(before, event) } : {}),
      };
    }
    case 'note_misconception': {
      if (event?.type !== 'misconception_noted') return { ok: true };
      const m = after.mastery[event.nodeId]?.misconceptions.find(
        (x) => x.id === event.misconceptionId,
      );
      const takenBack = events.some((e) => e.type === 'evidence_recorded');
      const claimedEarlier =
        command?.type === 'note_misconception' && command.shownBy === 'earlier_answer';
      return {
        ok: true,
        topic: event.nodeId,
        misconceptionId: event.misconceptionId,
        occurrences: m?.occurrences ?? 1,
        shownBy: event.shownBy ?? 'latest_answer',
        ...(claimedEarlier && !event.shownBy
          ? {
              shownByNote: `Taken as shown by their latest answer: no earlier mistake on ${event.nodeId} is recorded, so no earlier answer could have shown it.`,
            }
          : {}),
        ...(takenBack
          ? {
              mastery: percent(confidenceOf(after, event.nodeId)),
              was: percent(confidenceOf(before, event.nodeId)),
              note: `The gain you recorded on ${event.nodeId} earlier in this reply was taken back: an answer that shows a misconception earns nothing on its topic. Record a wrong answer as struggled.`,
            }
          : {}),
      };
    }
    case 'resolve_misconception':
      return event?.type === 'misconception_resolved'
        ? { ok: true, topic: event.nodeId, resolved: event.misconceptionId }
        : { ok: true, note: 'It was already resolved; nothing changed.' };
    case 'complete_topic': {
      const nodeId = event?.type === 'topic_completed' ? event.nodeId : '';
      const next = after.phase === 'interlude' ? nextReadyNode(after.plan)?.id : undefined;
      return {
        ok: true,
        phase: after.phase,
        completed: topicSummary(after, nodeId),
        ...(next ? { nextInPlan: next } : {}),
        note:
          after.phase === 'complete'
            ? 'Every topic in the plan is done.'
            : 'The learner now sees a chapter break under your reply that asks what comes next: go on, more practice, or edit the plan. If your reply before this call already said what they can now do, write nothing more and end your turn; otherwise close the topic with a short line on what they can now do and end your turn. Either way, do not list those choices or ask which they want, and do not start the next topic in this reply.',
      };
    }
    case 'start_topic': {
      const node = after.plan?.nodes.find((n) => n.id === after.currentNodeId);
      return {
        ok: true,
        phase: after.phase,
        topic: node
          ? { ...topicSummary(after, node.id), name: node.name, objectives: node.objectives }
          : undefined,
        ...(events.length ? {} : { note: 'It was already in progress; nothing changed.' }),
      };
    }
  }
}

/** The unanswered card a plan proposal closed, if any. */
function closedCard(events: readonly TutorEvent[]): { closed?: string; closedNote?: string } {
  const dismissed = events.find((e) => e.type === 'card_dismissed');
  if (dismissed?.type !== 'card_dismissed') return {};
  return { closed: dismissed.card, closedNote: `The unanswered ${dismissed.card} card is closed.` };
}
