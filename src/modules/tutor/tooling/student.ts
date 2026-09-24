// Module: tutor tooling student
// Responsibility: the simulated learner. An LLM plays the persona in conversation and makes
// the judgement calls (intake answers, approving a plan, what to do at a chapter break);
// multiple-choice answers are drawn from the scenario's error rates, so knowledge gaps show
// up in the scores the engine records.

import type { ModelMessage } from '@/lib/transport/contracts';
import type { LearningPlan } from '@/lib/types';
import type { IntakeQuestion } from '@/modules/tutor/engine';
import { matchGap, type KnowledgeGap, type Scenario } from '@/modules/tutor/tooling/scenarios';

/** One completion from the student's model: the messages in, the text out. */
export type StudentLLM = (messages: ModelMessage[]) => Promise<string>;

export type StudentOptions = {
  scenario: Scenario;
  llm: StudentLLM;
  seed?: number;
  /** Chance of a wrong answer on an item outside every gap. */
  baseErrorRate?: number;
  /** A gap's error rate is multiplied by this after each quiz on it: teaching lands, slowly. */
  learningRate?: number;
  /** Conversation messages the student remembers. */
  memory?: number;
};

export type ChoiceItem = { question: string; choices: string[]; correct?: number };

export type ChoiceAnswer = { choice: number; correct?: boolean; gap?: string };

export type ProposalDecision = { approve: boolean; feedback?: string };

export type ChapterChoice = { choice: 'go_on' | 'more_practice' | 'type'; message?: string };

export type QuietEdit =
  | { action: 'mark_known'; topicId: string }
  | { action: 'adjust'; topicId: string; to: number };

/** mulberry32: small, seedable, good enough to make runs repeatable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The first JSON object in a model's reply, or undefined. */
export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function personaPrompt(scenario: Scenario): string {
  return [
    'You are role-playing a student in a one-to-one tutoring chat. The chat is an automated test of the tutor, so stay in character throughout.',
    '',
    `Who you are: ${scenario.persona}`,
    `What you want: ${scenario.goal}`,
    'Your situation:',
    ...scenario.constraints.map((c) => `- ${c}`),
    '',
    'Where you are weak. Keep making these mistakes until the tutor has clearly worked through them with you, and even then let it sink in gradually:',
    ...scenario.gaps.map((gap) => `- ${gap.topic}: ${gap.misconception}`),
    '',
    "How to write: like a real student typing in a chat. One to three short sentences. Sometimes ask a question, sometimes attempt the problem and show your working. When the tutor asks you to solve something, actually try it, and make the mistakes your weaknesses predict. Do not summarise the lesson back, do not thank the tutor every turn, and never write the tutor's part. Never mention being an AI, a simulation or a test.",
  ].join('\n');
}

export class SimulatedStudent {
  readonly scenario: Scenario;
  private readonly llm: StudentLLM;
  private readonly random: () => number;
  private readonly baseErrorRate: number;
  private readonly learningRate: number;
  private readonly memory: number;
  private readonly system: string;
  private readonly rates = new Map<string, number>();
  private history: ModelMessage[] = [];

  constructor(options: StudentOptions) {
    this.scenario = options.scenario;
    this.llm = options.llm;
    this.random = seededRandom(options.seed ?? 1);
    this.baseErrorRate = options.baseErrorRate ?? 0.1;
    this.learningRate = options.learningRate ?? 0.6;
    this.memory = options.memory ?? 24;
    this.system = personaPrompt(options.scenario);
    for (const gap of options.scenario.gaps) this.rates.set(gap.topic, gap.errorRate);
  }

  // ---------------------------------------------------------------- conversation

  /** The tutor's reply as the student sees it, with whatever else is on screen. */
  hear(tutorText: string, onScreen?: string): void {
    const parts = [tutorText.trim() || '(The tutor wrote nothing.)'];
    if (onScreen) parts.push(`[On screen]\n${onScreen}`);
    this.remember({ role: 'user', content: parts.join('\n\n') });
  }

  /** Something the student did or wrote, in their own memory. */
  did(note: string): void {
    this.remember({ role: 'assistant', content: note });
  }

  async opening(): Promise<string> {
    const text = await this.complete([
      {
        role: 'user',
        content:
          'The tutor has just opened the chat. Write your first message: what you want help with and anything about your situation that matters. One to three sentences.',
      },
    ]);
    this.did(text);
    return text;
  }

  /** A typed reply to the tutor's latest message. */
  async reply(): Promise<string> {
    const text = await this.complete(this.history);
    this.did(text);
    return text;
  }

  // ---------------------------------------------------------------- cards

  async answerIntake(questions: IntakeQuestion[]): Promise<Record<string, string[]>> {
    const listing = questions
      .map(
        (q) =>
          `${q.id}: ${q.question}${q.allowMultiple ? ' (choose one or more)' : ''}\n${q.options
            .map((o) => `  - ${o.label}${o.description ? ` (${o.description})` : ''}`)
            .join('\n')}`,
      )
      .join('\n');
    const parsed = await this.ask(
      `The tutor showed you an intake card. Answer every question as your character would, choosing from the options.\n\n${listing}\n\nReply with JSON only: {"answers": {"<question id>": ["<option label>"]}}`,
    );
    const raw = (parsed?.answers ?? {}) as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const q of questions) {
      const picked = Array.isArray(raw[q.id]) ? (raw[q.id] as unknown[]) : [raw[q.id]];
      const labels = picked
        .map((p) =>
          typeof p === 'string'
            ? q.options.find((o) => o.label.toLowerCase() === p.trim().toLowerCase())?.label
            : undefined,
        )
        .filter((l): l is string => !!l);
      out[q.id] = labels.length ? (q.allowMultiple ? labels : [labels[0]]) : [q.options[0].label];
    }
    return out;
  }

  /**
   * A multiple-choice answer, drawn from the error rate of the gap the item is
   * about (or the base rate). `topicText` describes the plan topic it tests.
   */
  answerChoice(item: ChoiceItem, topicText: string): ChoiceAnswer {
    const gap = this.gapFor(topicText, item.question);
    const rate = gap ? (this.rates.get(gap.topic) ?? gap.errorRate) : this.baseErrorRate;
    const n = item.choices.length;
    if (typeof item.correct !== 'number' || item.correct < 0 || item.correct >= n) {
      return { choice: Math.floor(this.random() * n), ...(gap ? { gap: gap.topic } : {}) };
    }
    const wrong = n > 1 && this.random() < rate;
    let choice = item.correct;
    if (wrong) {
      const others = item.choices.map((_, i) => i).filter((i) => i !== item.correct);
      choice = others[Math.floor(this.random() * others.length)];
    }
    return { choice, correct: choice === item.correct, ...(gap ? { gap: gap.topic } : {}) };
  }

  /** After a quiz on a gap, the student gets a little better at it. */
  practised(gapTopic: string): void {
    const rate = this.rates.get(gapTopic);
    if (rate !== undefined) this.rates.set(gapTopic, rate * this.learningRate);
  }

  errorRates(): Record<string, number> {
    return Object.fromEntries(this.rates);
  }

  async reviewProposal(
    plan: LearningPlan,
    rationale: string | undefined,
    canDecline: boolean,
  ): Promise<ProposalDecision> {
    if (!canDecline) return { approve: true };
    const topics = plan.nodes
      .map((n, i) => `${i + 1}. ${n.name}: ${n.objectives?.join('; ') ?? ''}`)
      .join('\n');
    const parsed = await this.ask(
      `The tutor proposed this plan and you can approve it or ask for changes.\n\nGoal: ${plan.goal}\n${topics}${rationale ? `\nWhy: ${rationale}` : ''}\n\nApprove unless it clearly does not fit your situation (for example it spends most of the time on what you already know, or skips what you need). If you decline, say in one sentence what should change.\n\nReply with JSON only: {"decision": "approve" | "decline", "feedback": "<one sentence, only when declining>"}`,
    );
    const decline = parsed?.decision === 'decline' && typeof parsed.feedback === 'string';
    return decline ? { approve: false, feedback: String(parsed.feedback) } : { approve: true };
  }

  async atChapterBreak(
    completed: string,
    next?: string,
    estimate?: number,
  ): Promise<ChapterChoice> {
    const parsed = await this.ask(
      `A chapter break appeared: "${completed}" is finished${estimate !== undefined ? ` and the tutor puts you at ${estimate}%` : ''}. You can press "${next ? `Go on: ${next}` : 'Go on'}", press "Not yet, more practice", or type a message instead.\n\nReply with JSON only: {"choice": "go_on" | "more_practice" | "type", "message": "<only when you type>"}`,
    );
    const choice = parsed?.choice;
    if (choice === 'more_practice') return { choice };
    if (choice === 'type' && typeof parsed?.message === 'string' && parsed.message.trim()) {
      return { choice, message: parsed.message.trim() };
    }
    return { choice: 'go_on' };
  }

  /** Quiet corrections to the plan or the learner model; usually none. */
  async quietEdits(view: string, canMarkKnown: boolean, canAdjust: boolean): Promise<QuietEdit[]> {
    if (!canMarkKnown && !canAdjust) return [];
    const allowed = [
      canMarkKnown
        ? '{"action": "mark_known", "topicId": "<id>"} for a topic you already know well from class (never one you are weak on)'
        : undefined,
      canAdjust
        ? '{"action": "adjust", "topicId": "<id>", "to": <0-100>} when a percentage is clearly wrong about you'
        : undefined,
    ].filter(Boolean);
    const parsed = await this.ask(
      `This is your learning plan and the tutor's estimate of you, as the side panel shows it:\n${view}\n\nYou may correct it without telling the tutor. Most of the time leave it alone. Allowed edits:\n${allowed.map((a) => `- ${a}`).join('\n')}\n\nReply with JSON only: {"edits": []}`,
    );
    const edits = Array.isArray(parsed?.edits) ? (parsed.edits as unknown[]) : [];
    const out: QuietEdit[] = [];
    for (const raw of edits.slice(0, 2)) {
      if (!raw || typeof raw !== 'object') continue;
      const edit = raw as Record<string, unknown>;
      if (typeof edit.topicId !== 'string') continue;
      if (edit.action === 'mark_known' && canMarkKnown) {
        out.push({ action: 'mark_known', topicId: edit.topicId });
      } else if (edit.action === 'adjust' && canAdjust && typeof edit.to === 'number') {
        out.push({
          action: 'adjust',
          topicId: edit.topicId,
          to: Math.min(100, Math.max(0, edit.to)),
        });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- internals

  private gapFor(topicText: string, question: string): KnowledgeGap | undefined {
    return matchGap(this.scenario, topicText) ?? matchGap(this.scenario, question);
  }

  private remember(message: ModelMessage): void {
    this.history.push(message);
    if (this.history.length > this.memory) {
      this.history = this.history.slice(-this.memory);
      // A conversation handed to a model starts with the other side's turn.
      while (this.history[0] && this.history[0].role !== 'user') this.history.shift();
    }
  }

  private async complete(messages: ModelMessage[]): Promise<string> {
    const text = (await this.llm([{ role: 'system', content: this.system }, ...messages])).trim();
    return text || 'Okay.';
  }

  /** A one-off question about the screen; neither it nor the answer joins the memory. */
  private async ask(instruction: string): Promise<Record<string, unknown> | undefined> {
    const history = this.history.slice();
    const last = history[history.length - 1];
    if (last?.role === 'user' && typeof last.content === 'string') {
      history[history.length - 1] = {
        role: 'user',
        content: `${last.content}\n\n---\n${instruction}`,
      };
    } else {
      history.push({ role: 'user', content: instruction });
    }
    return parseJsonObject(await this.complete(history));
  }
}
