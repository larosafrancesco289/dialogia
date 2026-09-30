// Module: tutor ui messageViews
// Responsibility: what one assistant message's tutor surfaces show, read from the event log:
// its cards, and what its events changed (margin notes, a finished chapter).

import type { CarriedOver, Evidence, LearningPlan, TopicMastery } from '@/lib/types';
import {
  MASTERY_EVIDENCE_MIN,
  apply,
  confidenceOf,
  effectiveEvents,
  emptyTutorState,
  percent,
  type CompletionHow,
  type DiagnosticRecord,
  type IntakeRecord,
  type QuizRecord,
  type TutorEvent,
} from '@/modules/tutor/engine';
import type { TutorSession } from '@/modules/tutor/store/tutorSlice';
import { countWord, joinSentences, listInProse } from '@/modules/tutor/lib/text';

export type ProposalView = {
  proposalId: string;
  plan: LearningPlan;
  rationale?: string;
  /** It revises an approved plan. */
  revision: boolean;
  status: 'pending' | 'approved' | 'declined' | 'replaced';
};

export type IntakeView = IntakeRecord;

export type MessageCards = {
  intake?: IntakeView;
  diagnostic?: DiagnosticRecord;
  quiz?: QuizRecord;
  proposal?: ProposalView;
};

function latestFor<T extends { messageId?: string; seq: number }>(
  records: Record<string, T>,
  messageId: string,
): T | undefined {
  let found: T | undefined;
  for (const record of Object.values(records)) {
    if (record.messageId === messageId && (!found || record.seq > found.seq)) found = record;
  }
  return found;
}

/**
 * The message's proposal and what became of it. A later proposal replaces it
 * when it was still waiting, or answers it when the learner asked for changes:
 * either way the card then points at the revision below.
 */
function proposalFor(events: readonly TutorEvent[], messageId: string): ProposalView | undefined {
  let view: ProposalView | undefined;
  for (const event of events) {
    if (event.type === 'plan_proposed') {
      if (event.messageId === messageId) {
        view = {
          proposalId: event.proposalId,
          plan: event.plan,
          ...(event.rationale ? { rationale: event.rationale } : {}),
          revision: event.revision,
          status: 'pending',
        };
      } else if (view?.status === 'pending' || view?.status === 'declined') {
        view = { ...view, status: 'replaced' };
      }
    } else if (event.type === 'proposal_imported' && event.messageId === messageId) {
      view = {
        proposalId: event.proposalId,
        plan: event.plan,
        ...(event.rationale ? { rationale: event.rationale } : {}),
        revision: false,
        status: event.status,
      };
    } else if (view && event.type === 'plan_approved' && event.proposalId === view.proposalId) {
      view = { ...view, status: 'approved' };
    } else if (view && event.type === 'plan_declined' && event.proposalId === view.proposalId) {
      view = { ...view, status: 'declined' };
    }
  }
  return view;
}

/** The cards an assistant message put in front of the learner, as they stand now. */
export function cardsForMessage(session: TutorSession, messageId: string): MessageCards {
  const { state } = session;
  const events = effectiveEvents(session.events);
  const cards: MessageCards = {};
  const intake = latestFor(state.intakes, messageId);
  if (intake) cards.intake = intake;
  const diagnostic = latestFor(state.diagnostics, messageId);
  if (diagnostic) cards.diagnostic = diagnostic;
  const quiz = latestFor(state.quizzes, messageId);
  if (quiz) cards.quiz = quiz;
  const proposal = proposalFor(events, messageId);
  if (proposal) cards.proposal = proposal;
  return cards;
}

/** One topic's movement from a message's evidence, with the notes that moved it. */
export type MasteryChange = {
  nodeId: string;
  from: number;
  to: number;
  notes: string[];
  /**
   * Where the learner's correction put the estimate, when they corrected it
   * while this note was still the estimate (from the note or from the Hub).
   */
  corrected?: number;
  /** The change started the topic from another tutor chat; its note is said in `carriedOverWords`. */
  carriedOver?: CarriedOver;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "27 Sep", with the year when it is not this one. */
function shortDate(at: number): string {
  const date = new Date(at);
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date().getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/**
 * Where a carried-over estimate came from, as the learner reads it: "Carried
 * over from Learning Bayes’ rule (84%, 27 Sep), capped at 75% until you
 * answer two questions here." `title` is the source chat's, while it exists;
 * the source topic is named when it differs from `topic`, the one here.
 */
export function carriedOverWords(
  carried: CarriedOver,
  setTo: number,
  topic: string,
  title: string | undefined,
): string {
  const sameTopic = carried.topic.trim().toLowerCase() === topic.trim().toLowerCase();
  const from = !title
    ? `${carried.topic} in another tutor chat`
    : sameTopic
      ? title
      : `${carried.topic} in ${title}`;
  const capped =
    percent(setTo) < percent(carried.estimate)
      ? `, capped at ${percent(setTo)}% until you answer ${countWord(MASTERY_EVIDENCE_MIN)} questions here`
      : '';
  return `Carried over from ${from} (${percent(carried.estimate)}%, ${shortDate(carried.studiedAt)})${capped}.`;
}

/**
 * The changes a message's margin notes show: every topic whose estimate it
 * moved, the topic it finished included. The chapter break states where that
 * topic stands; the note says what the exchange changed and why, and is
 * where the learner answers it.
 */
export function marginChanges(effects: MessageEffects): MasteryChange[] {
  return effects.masteryChanges.filter((change) => change.from !== change.to);
}

/** A margin note's reasons folded to this many (the latest); the rest wait behind "+N more". */
const REASONS_SHOWN = 2;

// The engine's own record of a graded answer: `Quiz, right: "question"`. The
// tutor reads it as it is; the learner is shown it in words.
const GRADED = /^(Quiz|Diagnostic), (right|wrong): "([\s\S]*)"$/;

const cardWord = (kind: string) => (kind === 'Quiz' ? 'quiz' : 'starting');

// Notes the engine words for the tutor, and how the learner reads them: the
// Hub already labels a starting estimate, and speaks to the learner as "you".
const FOR_LEARNER: [RegExp, string][] = [
  [/^Starting estimate from the diagnostic: /, ''],
  [/^From what the learner said before the plan$/, 'From what you said before the plan'],
  [/^(Learner|Student) /, 'You '],
];

/** An evidence note as the learner reads it, one line of "Why N%". */
export function readableNote(note: string): string {
  const graded = GRADED.exec(note.trim());
  if (!graded) return FOR_LEARNER.reduce((text, [from, to]) => text.replace(from, to), note);
  const [, kind, verdict, rawQuestion] = graded;
  // Notes written before cuts ended at a word still end in three dots.
  const question = rawQuestion.replace(/\.\.\.$/, '…');
  const what = `a ${cardWord(kind)} question`;
  return verdict === 'right'
    ? `Answered ${what} correctly: “${question}”`
    : `Missed ${what}: “${question}”`;
}

/** Graded answers in one reply, counted: the card itself is just above. */
function gradedSummary(graded: RegExpExecArray[]): string | undefined {
  if (!graded.length) return undefined;
  const word = cardWord(graded[0][1]);
  const right = graded.filter((g) => g[2] === 'right').length;
  if (graded.length === 1) {
    return right ? `Got the ${word} question right` : `Missed the ${word} question`;
  }
  return `Got ${right} of ${graded.length} ${word} questions right`;
}

/**
 * The reason a margin note gives: every note that moved the estimate, as
 * sentences, or (folded) the latest two and how many more there are. Graded
 * answers are counted into one sentence rather than quoted back. Nothing is
 * ever dropped silently.
 */
export function marginReason(notes: string[], unfolded: boolean): { text: string; more: number } {
  const clean = notes.map((note) => note.trim()).filter(Boolean);
  const graded = clean.map((note) => GRADED.exec(note)).filter((g) => g !== null);
  const summary = gradedSummary(graded);
  const reasons = [...(summary ? [summary] : []), ...clean.filter((note) => !GRADED.test(note))];
  const shown = unfolded ? reasons : reasons.slice(-REASONS_SHOWN);
  return { text: joinSentences(...shown), more: reasons.length - shown.length };
}

/** A topic the message's events completed, and what the learner made of it at that seam. */
export type Completion = {
  nodeId: string;
  how: CompletionHow;
  /**
   * The topic's estimate and evidence at the seam: as it stands while the seam
   * is open (a correction there shows at once), and as it stood when the
   * learner went on, not today's.
   */
  mastery?: TopicMastery;
  /** The topic started after this one, once one has been. */
  nextNodeId?: string;
  /** The learner took this topic up again before anything else started. */
  reopened?: boolean;
};

/** A misconception the tutor noted in a reply, shown where it was noticed as well as in the Hub. */
export type NotedMisconception = { nodeId: string; description: string };

export type MessageEffects = {
  masteryChanges: MasteryChange[];
  completed?: Completion;
  misconceptions?: NotedMisconception[];
};

const effectsCache = new WeakMap<readonly TutorEvent[], Map<string, MessageEffects>>();

/**
 * Per message, what its events did: each topic's estimate before and after
 * (with the notes that moved it), and the topic it finished, with what the
 * learner did next at that seam: the first topic started or reopened after
 * it, and the estimate they decided on. What happens to the topic later is
 * not that seam's to show. One replay of the (retraction-aware) log per log,
 * shared by every message.
 */
export function effectsByMessage(events: readonly TutorEvent[]): Map<string, MessageEffects> {
  const cached = effectsCache.get(events);
  if (cached) return cached;
  const out = new Map<string, MessageEffects>();
  let state = emptyTutorState();
  let awaitingNext: Completion | undefined;
  // Per topic, the note whose estimate still stands: a correction now answers it.
  const standing = new Map<string, MasteryChange>();
  for (const event of effectiveEvents(events)) {
    const before = state;
    state = apply(state, event);
    if (awaitingNext && (event.type === 'topic_started' || event.type === 'topic_reopened')) {
      if (event.type === 'topic_reopened' && event.nodeId === awaitingNext.nodeId) {
        awaitingNext.reopened = true;
      } else {
        awaitingNext.nextNodeId = event.nodeId;
      }
      awaitingNext.mastery = before.mastery[awaitingNext.nodeId];
      awaitingNext = undefined;
    }
    const messageId = event.messageId;
    if (!messageId) {
      if (event.type !== 'evidence_recorded') continue;
      const to = confidenceOf(state, event.nodeId);
      const note = standing.get(event.nodeId);
      if (note && event.source === 'learner' && event.kind === 'adjusted') note.corrected = to;
      else if (to !== confidenceOf(before, event.nodeId)) standing.delete(event.nodeId);
      continue;
    }
    if (event.type === 'evidence_recorded') {
      const entry = out.get(messageId) ?? { masteryChanges: [] };
      let change = entry.masteryChanges.find((c) => c.nodeId === event.nodeId);
      const to = confidenceOf(state, event.nodeId);
      const moved = to !== confidenceOf(before, event.nodeId);
      if (change) {
        change.to = to;
        if (!event.carriedOver) change.notes.push(event.note);
        if (moved) delete change.corrected;
      } else {
        change = {
          nodeId: event.nodeId,
          from: confidenceOf(before, event.nodeId),
          to,
          notes: event.carriedOver ? [] : [event.note],
        };
        entry.masteryChanges.push(change);
      }
      if (event.carriedOver) change.carriedOver = event.carriedOver;
      if (moved) standing.set(event.nodeId, change);
      out.set(messageId, entry);
    } else if (event.type === 'misconception_noted') {
      const entry = out.get(messageId) ?? { masteryChanges: [] };
      (entry.misconceptions ??= []).push({
        nodeId: event.nodeId,
        description: event.description,
      });
      out.set(messageId, entry);
    } else if (event.type === 'topic_completed') {
      const entry = out.get(messageId) ?? { masteryChanges: [] };
      if (awaitingNext) awaitingNext.mastery = before.mastery[awaitingNext.nodeId];
      awaitingNext = { nodeId: event.nodeId, how: event.how };
      entry.completed = awaitingNext;
      out.set(messageId, entry);
    }
  }
  // Still open: the break asks about the estimate as it is now.
  if (awaitingNext) awaitingNext.mastery = state.mastery[awaitingNext.nodeId];
  effectsCache.set(events, out);
  return out;
}

// Legacy entries carry no source; these types were the learner's own work.
const LEGACY_ANSWERS = new Set<Evidence['type']>([
  'correct_answer',
  'incorrect_answer',
  'partial_answer',
  'insight_demonstrated',
]);

type EvidenceGroup =
  | 'answer'
  | 'observation'
  | 'said'
  | 'correction'
  | 'practice'
  | 'estimate'
  | 'carried'
  | 'earlier';

const GROUP_WORDS: Record<EvidenceGroup, (n: number) => string> = {
  answer: (n) => `${countWord(n)} answer${n === 1 ? '' : 's'}`,
  // Read after "The tutor puts you at N%, from …", so "it" is the tutor.
  observation: (n) => (n === 1 ? 'something it noticed' : `${countWord(n)} things it noticed`),
  said: (n) =>
    n === 1 ? 'something you told the tutor' : `${countWord(n)} things you told the tutor`,
  correction: (n) => (n === 1 ? 'your correction' : `${countWord(n)} corrections of yours`),
  practice: (n) =>
    n === 1 ? 'your request for more practice' : `${countWord(n)} requests for more practice`,
  estimate: (n) => (n === 1 ? 'a starting estimate' : `${countWord(n)} starting estimates`),
  // Only a topic with no evidence yet takes one, so there is never a second.
  carried: () => 'what you showed in another tutor chat',
  earlier: (n) => `${countWord(n)} earlier note${n === 1 ? '' : 's'}`,
};

function groupOf(entry: Evidence): EvidenceGroup {
  if (entry.carriedOver) return 'carried';
  if (entry.kind === 'placement' || entry.source === 'placement') return 'estimate';
  // Older logs: asking for more practice used to cap the estimate. It corrected nothing.
  if (entry.kind === 'more_practice') return 'practice';
  switch (entry.source) {
    case 'quiz':
    case 'diagnostic':
      return 'answer';
    case 'observation':
      return 'observation';
    case 'learner_said':
      return 'said';
    case 'learner':
      return 'correction';
    default:
      return LEGACY_ANSWERS.has(entry.type) ? 'answer' : 'earlier';
  }
}

/**
 * Everything a topic's estimate rests on, in words: "one answer, two
 * observations and a starting estimate". Every piece counts, whatever its
 * source, so the sentence never claims less than stands behind the number.
 */
export function evidenceBehind(evidence: readonly Evidence[]): string | undefined {
  const counts = new Map<EvidenceGroup, number>();
  for (const entry of evidence) {
    const group = groupOf(entry);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const order: EvidenceGroup[] = [
    'answer',
    'observation',
    'said',
    'correction',
    'practice',
    'earlier',
    'carried',
    'estimate',
  ];
  const parts = order.filter((g) => counts.has(g)).map((g) => GROUP_WORDS[g](counts.get(g)!));
  return parts.length ? listInProse(parts) : undefined;
}
