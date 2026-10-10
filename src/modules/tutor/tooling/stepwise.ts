// Module: tutor tooling stepwise
// Responsibility: a tutor chat played one learner move at a time, saved to a folder between
// moves, so that someone outside the process (a person, or an agent playing a learner) can
// take each turn. Every move is one the UI offers, sent the way the UI sends it, and the
// screen shows only what the UI would.

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import { computeCost } from '@/lib/cost';
import { repository } from '@/lib/db';
import { setLocale } from '@/lib/i18n/state';
import { LOCALES, type Locale } from '@/lib/i18n/locales';
import type { Usage } from '@/lib/api/normalizers';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import {
  DAY_MS,
  confidenceOf,
  contestTarget,
  daysBetween,
  dueTopics,
  lastStudiedAt,
  nextReadyNode,
  openMisconceptions,
  percent,
  resolveTutorFlags,
  type TutorEvent,
  type TutorFlags,
  type TutorState,
} from '@/modules/tutor/engine';
import { t } from '@/modules/tutor/i18n';
import { LEDGER } from '@/modules/tutor/lib/ledger';
import { checkRun, DEFAULT_CHECK_OPTIONS, type CheckResult } from '@/modules/tutor/tooling/check';
import { connectProvider, type SimProvider } from '@/modules/tutor/tooling/providers';
import { renderReport } from '@/modules/tutor/tooling/report';
import { HeadlessTutorSession, type LearnerAction } from '@/modules/tutor/tooling/session';
import {
  snapshot,
  summarizeTurn,
  type ExchangeRecord,
  type LearnerActionRecord,
  type SimulationRun,
  type StudentTurn,
} from '@/modules/tutor/tooling/simulation';
import { effectsByMessage, seamOpen } from '@/modules/tutor/ui/messageViews';
import { TUTOR_SYSTEM_PROMPT } from '@/modules/tutor/agent/systemPrompt';
import { TUTOR_TOOLS } from '@/modules/tutor/engine/tools/definitions';

/**
 * The tutor's instructions as this build has them: its system prompt and every
 * tool's definition. Runs are compared only within one hash, so a prompt edit
 * starts a new series.
 */
export function tutorPromptHash(): string {
  return createHash('sha256')
    .update(TUTOR_SYSTEM_PROMPT)
    .update(JSON.stringify(TUTOR_TOOLS))
    .digest('hex')
    .slice(0, 12);
}

const SAVED_VERSION = 1;
const SESSION_FILE = 'session.json';

export type StepMeta = {
  provider: SimProvider;
  tutorModel: string;
  flags: TutorFlags;
  lang: Locale;
  /** Who plays the learner, for the record (a persona file's id). */
  persona?: string;
  createdAt: string;
  /** Tutor spend so far, from the provider's usage and the app's price table. */
  cost: number;
};

type SavedSession = {
  version: number;
  meta: StepMeta;
  chat: Chat;
  messages: Message[];
  events: TutorEvent[];
  exchanges: ExchangeRecord[];
  /** Learner changes made since the last turn that started none (quiet ones). */
  pending: LearnerActionRecord[];
  /** Breaks the learner took (`wait`), each after the exchange it followed. */
  waits?: Array<{ afterExchange: number; days: number }>;
};

export type StepDeps = {
  /** Replaces the network; tests script the tutor model here. */
  pipeline?: PipelineClient;
  envFile?: string;
};

export type NewRunOptions = {
  provider?: SimProvider;
  tutorModel: string;
  flags?: Partial<TutorFlags>;
  lang?: string;
  persona?: string;
};

const LETTERS = 'ABCDEFGHIJ';
const letter = (i: number) => LETTERS[i] ?? String(i + 1);

function asLocale(lang: string | undefined): Locale {
  const found = LOCALES.find((l) => l.code === lang);
  if (lang && !found) {
    throw new Error(`Unknown --lang "${lang}". Try: ${LOCALES.map((l) => l.code).join(', ')}`);
  }
  return found?.code ?? 'en';
}

function newChat(tutorModel: string, flags: TutorFlags): Chat {
  const now = Date.now();
  return {
    id: `step_${uuidv4()}`,
    title: 'Simulated tutoring session',
    createdAt: now,
    updatedAt: now,
    settings: {
      system: '',
      modelId: tutorModel,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: true,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          defaultModelId: tutorModel,
          planEditable: flags.planEditable,
          learnerModelVisible: flags.learnerModelVisible,
          learnerModelEditable: flags.learnerModelEditable,
        },
      },
    },
  };
}

/** One tutor chat, opened from its folder; every move saves it back. */
export class StepRun {
  private constructor(
    readonly dir: string,
    private saved: SavedSession,
    private readonly session: HeadlessTutorSession,
    private readonly model: ModelDescriptor,
    private readonly deps: StepDeps,
  ) {}

  static async create(dir: string, options: NewRunOptions, deps: StepDeps = {}): Promise<StepRun> {
    const taken = await fs
      .access(path.join(dir, SESSION_FILE))
      .then(() => true)
      .catch(() => false);
    if (taken) throw new Error(`${dir} already holds a session; pick another --run folder.`);
    const flags = resolveTutorFlags(options.flags ?? {});
    const saved: SavedSession = {
      version: SAVED_VERSION,
      meta: {
        provider: options.provider ?? 'anthropic',
        tutorModel: options.tutorModel,
        flags,
        lang: asLocale(options.lang),
        ...(options.persona ? { persona: options.persona } : {}),
        createdAt: new Date().toISOString(),
        cost: 0,
      },
      chat: newChat(options.tutorModel, flags),
      messages: [],
      events: [],
      exchanges: [],
      pending: [],
    };
    await fs.mkdir(dir, { recursive: true });
    const run = await StepRun.open(dir, deps, saved);
    await run.save();
    return run;
  }

  static async open(dir: string, deps: StepDeps = {}, fresh?: SavedSession): Promise<StepRun> {
    const saved =
      fresh ??
      (JSON.parse(await fs.readFile(path.join(dir, SESSION_FILE), 'utf8')) as SavedSession);
    if (saved.version !== SAVED_VERSION) {
      throw new Error(`${dir} was saved by another version of the stepper.`);
    }
    await setLocale(saved.meta.lang);
    const connection = await connectProvider(saved.meta.provider, {
      offline: !!deps.pipeline,
      ...(deps.envFile ? { envFile: deps.envFile } : {}),
    });
    const [model] = await connection.describe([saved.meta.tutorModel]);
    const session = new HeadlessTutorSession({
      chat: saved.chat,
      models: [model],
      resolveAuth: () => connection.auth,
      ...(deps.pipeline ? { pipeline: deps.pipeline } : {}),
    });
    await session.restore(saved.messages, saved.events);
    return new StepRun(dir, saved, session, model, deps);
  }

  get meta(): StepMeta {
    return this.saved.meta;
  }

  get state(): TutorState {
    return this.session.tutor().state;
  }

  private async save(): Promise<void> {
    this.saved = {
      ...this.saved,
      messages: this.session.messages(),
      events: [...this.session.tutor().events],
    };
    await fs.writeFile(path.join(this.dir, SESSION_FILE), JSON.stringify(this.saved, null, 2));
  }

  private async act(
    actions: LearnerActionRecord[],
    action: LearnerAction,
    messageId?: string,
  ): Promise<boolean> {
    const result = await this.session.learner(action, messageId);
    actions.push({
      action,
      ok: result.ok,
      ...(result.ok ? {} : { error: { code: result.error.code, message: result.error.message } }),
    });
    if (!result.ok) throw new Error(`The app refused that: ${result.error.message}`);
    return true;
  }

  /** Sends the learner's move and runs the tutor's turn; returns the screen after it. */
  private async turn(move: StudentTurn, before = ''): Promise<string> {
    const record = await this.session.runTurn(move.text, { ledger: move.kind === 'ledger' });
    const tutor = summarizeTurn(record);
    const usage = record.assistant.usage as Usage | undefined;
    const spent = computeCost({ model: this.model, usage }).total ?? 0;
    this.saved.meta.cost += spent;
    this.saved.exchanges.push({
      index: this.saved.exchanges.length + 1,
      student: { ...move, actions: [...this.saved.pending, ...move.actions] },
      tutor,
      after: snapshot(this.state),
      quietEdits: [],
    });
    this.saved.pending = [];
    await this.save();
    if (tutor.error) return `${before}The tutor's turn failed: ${tutor.error}\n`;
    return before + this.screen();
  }

  /**
   * The learner comes back `days` later. Everything saved moves that far into
   * the past, so the next move runs at today's clock after a real-looking gap:
   * the app reads time only from what it stored, and from the clock.
   */
  async wait(days: number): Promise<string> {
    if (!Number.isFinite(days) || days <= 0) throw new Error('wait needs a number of days.');
    const ms = Math.round(days * DAY_MS);
    const { chat, messages, events } = this.saved;
    this.saved = {
      ...this.saved,
      chat: { ...chat, createdAt: chat.createdAt - ms, updatedAt: chat.updatedAt - ms },
      messages: messages.map((message) => ({ ...message, createdAt: message.createdAt - ms })),
      events: events.map((event) => ({ ...event, at: event.at - ms })),
      waits: [...(this.saved.waits ?? []), { afterExchange: this.saved.exchanges.length, days }],
    };
    await fs.writeFile(path.join(this.dir, SESSION_FILE), JSON.stringify(this.saved, null, 2));
    // Reopened as the next move's fresh process will find it: from the folder alone.
    await repository.deleteChatAndMessages(chat.id);
    await repository.deleteTutorEvents(chat.id);
    const back = await StepRun.open(this.dir, this.deps);
    return `${days} day(s) later, you open the chat again.\n\n${back.screen()}`;
  }

  /** "Review now" in the Learning Hub: asks the tutor for a refresher on what is due. */
  async review(): Promise<string> {
    const plan = this.state.plan;
    const due = dueTopics(this.state, Date.now()).flatMap(
      (schedule) => plan?.nodes.find((n) => n.id === schedule.nodeId)?.name ?? [],
    );
    if (!due.length) throw new Error(`Nothing is due for a refresher. ${this.movesLine()}`);
    return this.turn({ kind: 'ledger', text: LEDGER.review(due), actions: [] });
  }

  private requireCard(kind: 'quiz' | 'diagnostic' | 'intake' | 'proposal') {
    const open = this.state.awaiting;
    if (!open || open.kind !== kind) {
      throw new Error(`There is no ${kind} card open. ${this.movesLine()}`);
    }
    return open;
  }

  async say(text: string): Promise<string> {
    if (!text.trim()) throw new Error('say needs a message.');
    return this.turn({
      kind: 'typed',
      text,
      actions: [],
      ...(this.state.awaiting ? { pastCard: true } : {}),
    });
  }

  /** Answers the open quiz or diagnostic: one letter per unanswered question, in order. */
  async answer(letters: string[]): Promise<string> {
    const open = this.state.awaiting;
    if (open?.kind === 'diagnostic') return this.answerDiagnostic(open.id, letters);
    const quizId = this.requireCard('quiz').id;
    const quiz = this.state.quizzes[quizId];
    const pending = quiz.items.filter((item) => !quiz.answers[item.id]);
    if (letters.length !== pending.length) {
      throw new Error(
        `The quiz has ${pending.length} unanswered question(s); give one letter each.`,
      );
    }
    const actions: LearnerActionRecord[] = [];
    const feedback: string[] = [];
    for (const [i, item] of pending.entries()) {
      const choice = LETTERS.indexOf(letters[i].toUpperCase());
      if (choice < 0 || choice >= item.choices.length) {
        throw new Error(`"${letters[i]}" is not a choice for question ${i + 1}.`);
      }
      await this.act(
        actions,
        { type: 'answer_quiz_item', quizId, itemId: item.id, choice },
        quiz.messageId,
      );
      // The card shows each verdict and its explanation as the answer lands.
      const right = this.state.quizzes[quizId]?.answers[item.id]?.correct;
      feedback.push(
        `${i + 1}. You chose ${letter(choice)}: ${right ? 'correct' : `not quite (the answer was ${letter(item.correct)})`}.${item.explanation ? ` ${item.explanation}` : ''}`,
      );
    }
    const after = this.state.quizzes[quizId];
    const right = after.items.filter((item) => after.answers[item.id]?.correct).length;
    return this.turn(
      { kind: 'ledger', text: LEDGER.quizFinished(right, after.items.length), actions },
      `QUIZ RESULTS\n${feedback.join('\n')}\n\n`,
    );
  }

  private async answerDiagnostic(id: string, letters: string[]): Promise<string> {
    const diagnostic = this.state.diagnostics[id];
    if (letters.length !== diagnostic.items.length) {
      throw new Error(
        `The diagnostic has ${diagnostic.items.length} question(s); give one letter each.`,
      );
    }
    const answers: Record<string, number> = {};
    diagnostic.items.forEach((item, i) => {
      const choice = LETTERS.indexOf(letters[i].toUpperCase());
      if (choice < 0 || choice >= item.choices.length) {
        throw new Error(`"${letters[i]}" is not a choice for question ${i + 1}.`);
      }
      answers[item.id] = choice;
    });
    const actions: LearnerActionRecord[] = [];
    await this.act(
      actions,
      { type: 'answer_diagnostic', diagnosticId: id, answers },
      diagnostic.messageId,
    );
    const scored = diagnostic.items.filter((item) => typeof item.correct === 'number');
    const right = scored.filter((item) => answers[item.id] === item.correct).length;
    return this.turn({
      kind: 'ledger',
      text: LEDGER.diagnosticFinished(right, scored.length),
      actions,
    });
  }

  /** Answers the intake card: `1:A 2:B,C` (several letters where a question allows several). */
  async intake(specs: string[]): Promise<string> {
    const intake = this.state.intakes[this.requireCard('intake').id];
    const responses: Record<string, string[]> = {};
    for (const spec of specs) {
      const match = /^(\d+):([A-Za-z,]+)$/.exec(spec.trim());
      const question = match ? intake.questions[Number(match[1]) - 1] : undefined;
      if (!match || !question) throw new Error(`"${spec}" is not like 1:A or 2:B,C.`);
      const picked = match[2]
        .split(',')
        .map((l) => question.options[LETTERS.indexOf(l.toUpperCase())]);
      if (picked.some((option) => !option)) throw new Error(`"${spec}" names a missing option.`);
      if (picked.length > 1 && !question.allowMultiple) {
        throw new Error(`Question ${match[1]} takes one answer.`);
      }
      responses[question.id] = picked.map((option) => option.label);
    }
    const actions: LearnerActionRecord[] = [];
    await this.act(
      actions,
      { type: 'answer_intake', intakeId: intake.intakeId, responses },
      intake.messageId,
    );
    return this.turn({ kind: 'ledger', text: LEDGER.intakeAnswered(), actions });
  }

  async approve(): Promise<string> {
    this.requireCard('proposal');
    const proposal = this.state.proposal!;
    const actions: LearnerActionRecord[] = [];
    await this.act(
      actions,
      { type: 'approve_plan', proposalId: proposal.proposalId },
      proposal.messageId,
    );
    return this.turn({ kind: 'ledger', text: LEDGER.planApproved(), actions });
  }

  async decline(feedback: string): Promise<string> {
    this.requireCard('proposal');
    if (!this.meta.flags.planEditable) throw new Error('This plan cannot be changed.');
    const proposal = this.state.proposal!;
    const actions: LearnerActionRecord[] = [];
    await this.act(
      actions,
      { type: 'decline_plan', proposalId: proposal.proposalId, feedback },
      proposal.messageId,
    );
    return this.turn({ kind: 'ledger', text: LEDGER.planDeclined(feedback), actions });
  }

  private topic(index: string) {
    const node = this.state.plan?.nodes[Number(index) - 1];
    if (!node) throw new Error(`There is no topic ${index} in the plan.`);
    return node;
  }

  /** The topic the open chapter break closed, with the one that comes next. */
  private chapterBreak() {
    if (this.state.phase !== 'interlude') return undefined;
    const completed = [...this.session.tutor().events]
      .reverse()
      .find((e) => e.type === 'topic_completed');
    const node = this.state.plan?.nodes.find(
      (n) => completed && 'nodeId' in completed && n.id === completed.nodeId,
    );
    return node ? { node, next: nextReadyNode(this.state.plan) } : undefined;
  }

  async goOn(): Promise<string> {
    const seam = this.chapterBreak();
    if (!seam?.next)
      throw new Error(`There is no chapter break to go on from. ${this.movesLine()}`);
    const actions: LearnerActionRecord[] = [];
    await this.act(actions, { type: 'start_topic', nodeId: seam.next.id });
    return this.turn({ kind: 'ledger', text: LEDGER.goingOn(seam.next.name), actions });
  }

  async morePractice(): Promise<string> {
    const seam = this.chapterBreak();
    if (!seam) throw new Error(`There is no chapter break open. ${this.movesLine()}`);
    const actions: LearnerActionRecord[] = [];
    await this.act(actions, { type: 'more_practice', nodeId: seam.node.id });
    return this.turn({ kind: 'ledger', text: LEDGER.morePractice(seam.node.name), actions });
  }

  /** At an open chapter break a learner change waits there; the next turn reports it. */
  private atOpenSeam(): boolean {
    const latest = this.session.messages().at(-1);
    if (!latest) return false;
    const tutor = this.session.tutor();
    return seamOpen(effectsByMessage(tutor.events).get(latest.id)?.completed, tutor.state.phase);
  }

  /** A change from the Learning Hub, as its buttons make it. */
  async hub(
    kind: 'known' | 'too-high' | 'too-low' | 'reopen' | 'cleared',
    topicIndex: string,
    misconceptionIndex?: string,
  ): Promise<string> {
    const node = this.topic(topicIndex);
    const actions: LearnerActionRecord[] = [];
    if ((kind === 'too-high' || kind === 'too-low') && !this.meta.flags.learnerModelEditable) {
      throw new Error('Estimates cannot be changed in this session.');
    }
    switch (kind) {
      case 'known':
        await this.act(actions, { type: 'mark_known', nodeId: node.id });
        return this.turn({ kind: 'ledger', text: LEDGER.markedKnown(node.name), actions });
      case 'reopen':
        await this.act(actions, { type: 'reopen_topic', nodeId: node.id });
        return this.turn({ kind: 'ledger', text: LEDGER.reopenedTopic(node.name), actions });
      case 'too-high':
      case 'too-low': {
        const felt = kind === 'too-high' ? 'high' : 'low';
        await this.act(actions, {
          type: 'adjust_mastery',
          nodeId: node.id,
          setTo: contestTarget(confidenceOf(this.state, node.id), felt === 'high' ? 'down' : 'up'),
          note: `${t(felt === 'high' ? 'note.feltHigh' : 'note.feltLow')}.`,
        });
        return this.quietOrTurn(actions, LEDGER.contested(felt, node.name));
      }
      case 'cleared': {
        const misconception = openMisconceptions(this.state, node.id)[
          Number(misconceptionIndex) - 1
        ];
        if (!misconception)
          throw new Error(`Topic ${topicIndex} has no open idea ${misconceptionIndex}.`);
        await this.act(actions, {
          type: 'resolve_misconception',
          nodeId: node.id,
          misconceptionId: misconception.id,
        });
        return this.quietOrTurn(actions, LEDGER.clearedUp(misconception.description));
      }
    }
  }

  private async quietOrTurn(actions: LearnerActionRecord[], line: string): Promise<string> {
    if (!this.atOpenSeam()) return this.turn({ kind: 'ledger', text: line, actions });
    this.saved.pending.push(...actions);
    await this.save();
    return `Done. It shows on the chapter break and the tutor hears of it on your next move.\n\n${this.screen()}`;
  }

  /** What the learner sees now: the tutor's last message, the open card, the Hub. */
  screen(): string {
    const state = this.state;
    const out: string[] = [];
    const last = [...this.session.messages()].reverse().find((m) => m.role === 'assistant');
    out.push(`TUTOR\n${last?.content.trim() || '(nothing yet: start with say "...")'}`);

    const card = this.cardScreen(state);
    if (card) out.push(card);
    const seam = this.chapterBreak();
    if (seam) {
      const estimate = this.meta.flags.learnerModelVisible
        ? ` (estimate ${percent(confidenceOf(state, seam.node.id))}%)`
        : '';
      out.push(
        `CHAPTER BREAK: you finished "${seam.node.name}"${estimate}.${seam.next ? ` Next up: "${seam.next.name}".` : ' That was the last topic.'}`,
      );
    }
    if (state.phase === 'complete') out.push('The plan is complete.');
    const hub = this.hubScreen(state);
    if (hub) out.push(hub);
    out.push(this.movesLine());
    return `${out.join('\n\n')}\n`;
  }

  private cardScreen(state: TutorState): string | undefined {
    const open = state.awaiting;
    if (!open) return undefined;
    switch (open.kind) {
      case 'quiz': {
        const quiz = state.quizzes[open.id];
        const items = quiz.items.filter((item) => !quiz.answers[item.id]);
        return `QUIZ CARD (answer each question)\n${items
          .map(
            (item, i) =>
              `${i + 1}. ${item.question}\n${item.choices.map((c, j) => `   ${letter(j)}. ${c}`).join('\n')}`,
          )
          .join('\n')}`;
      }
      case 'diagnostic': {
        const d = state.diagnostics[open.id];
        return `DIAGNOSTIC CARD on ${d.topic} (answer each question)\n${d.items
          .map(
            (item, i) =>
              `${i + 1}. ${item.question}\n${item.choices.map((c, j) => `   ${letter(j)}. ${c}`).join('\n')}`,
          )
          .join('\n')}`;
      }
      case 'intake': {
        const intake = state.intakes[open.id];
        return `INTAKE CARD\n${intake.questions
          .map(
            (q, i) =>
              `${i + 1}. ${q.question}${q.allowMultiple ? ' (pick any)' : ' (pick one)'}\n${q.options
                .map(
                  (o, j) =>
                    `   ${letter(j)}. ${o.label}${o.description ? `: ${o.description}` : ''}`,
                )
                .join('\n')}`,
          )
          .join('\n')}`;
      }
      case 'proposal': {
        const proposal = state.proposal;
        if (!proposal) return undefined;
        const topics = proposal.plan.nodes.map((n, i) => {
          const start = proposal.startingEstimates?.[n.id];
          const pct =
            start && this.meta.flags.learnerModelVisible
              ? ` (starting estimate ${percent(start.value)}%)`
              : '';
          return `${i + 1}. ${n.name}${pct}${n.objectives.length ? `\n   You will: ${n.objectives.join('; ')}` : ''}`;
        });
        return `PLAN PROPOSAL CARD: ${proposal.plan.goal}\n${proposal.rationale ? `${proposal.rationale}\n` : ''}${topics.join('\n')}`;
      }
    }
  }

  private hubScreen(state: TutorState): string | undefined {
    const plan = state.plan;
    if (!plan) return undefined;
    const now = Date.now();
    const cardOpen = !!state.awaiting && state.awaiting.kind !== 'proposal';
    const due = new Set(cardOpen ? [] : dueTopics(state, now).map((s) => s.nodeId));
    const lines = plan.nodes.map((node, i) => {
      const status =
        node.status === 'completed'
          ? node.completedHow === 'skipped'
            ? 'left for now'
            : 'done'
          : node.status === 'in_progress'
            ? 'in progress'
            : 'not started';
      const estimate = this.meta.flags.learnerModelVisible
        ? `, ${percent(confidenceOf(state, node.id))}%`
        : '';
      const ideas = openMisconceptions(state, node.id).map(
        (m, j) => `\n   open idea ${j + 1}: ${m.description}`,
      );
      const studied = lastStudiedAt(state, node.id);
      const when = studied != null ? `, studied ${daysBetween(studied, now)} day(s) ago` : '';
      const refresh = due.has(node.id) ? ', due for a refresher' : '';
      return `${i + 1}. ${node.name}: ${status}${estimate}${when}${refresh}${ideas.join('')}`;
    });
    const box = due.size
      ? `\nTIME FOR A REFRESHER: a few quick questions now help you keep what you learned. (move: review)`
      : '';
    return `LEARNING HUB: ${plan.goal}\n${lines.join('\n')}${box}`;
  }

  private movesLine(): string {
    const state = this.state;
    const moves = ['say "<message>"'];
    switch (state.awaiting?.kind) {
      case 'quiz':
      case 'diagnostic':
        moves.unshift('answer <letter per question, e.g. B A C>');
        break;
      case 'intake':
        moves.unshift('intake <1:A 2:B,C …>');
        break;
      case 'proposal':
        moves.unshift(
          'approve',
          ...(this.meta.flags.planEditable ? ['decline "<what to change>"'] : []),
        );
        break;
    }
    const seam = this.chapterBreak();
    if (seam) moves.unshift(...(seam.next ? ['go-on'] : []), 'more-practice');
    if (state.plan) {
      const cardOpen = !!state.awaiting && state.awaiting.kind !== 'proposal';
      if (!cardOpen && dueTopics(state, Date.now()).length) moves.push('review');
      moves.push('known <topic#>', 'reopen <topic#>');
      if (this.meta.flags.learnerModelEditable) {
        moves.push('too-high <topic#>', 'too-low <topic#>', 'cleared <topic#> <idea#>');
      }
    }
    return `YOUR MOVES: ${moves.join(' | ')}`;
  }

  /** The run as the batch simulator records one, with its protocol checks; written to the folder. */
  async finish(): Promise<{ checks: CheckResult[]; report: string }> {
    const state = this.state;
    const run: SimulationRun = {
      meta: {
        scenario: this.meta.persona ?? 'stepwise',
        title: this.meta.persona ? `Persona ${this.meta.persona}` : 'Stepwise session',
        tutorModel: this.meta.tutorModel,
        studentModel: 'played step by step',
        flags: this.meta.flags,
        learnerEdits: true,
        seed: 0,
        exchanges: this.saved.exchanges.length,
        startedAt: this.meta.createdAt,
        durationMs: Date.now() - Date.parse(this.meta.createdAt),
        errorRates: {},
      },
      exchanges: this.saved.exchanges,
      events: [...this.session.tutor().events],
      state,
    };
    const checks = checkRun(run, DEFAULT_CHECK_OPTIONS);
    const report = renderReport(run, { full: true, checks });
    await fs.writeFile(
      path.join(this.dir, 'transcript.json'),
      JSON.stringify(
        {
          ...run,
          checks,
          cost: this.meta.cost,
          promptHash: tutorPromptHash(),
          ...(this.saved.waits?.length ? { waits: this.saved.waits } : {}),
        },
        null,
        2,
      ),
    );
    await fs.writeFile(path.join(this.dir, 'report.txt'), `${report}\n`);
    return { checks, report };
  }
}
