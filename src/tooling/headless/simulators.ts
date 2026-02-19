import { renderSnapshotTranscript, renderTutorTranscript } from '@/tooling/headless/transcript';
import type { HeadlessTurnSnapshot } from '@/tooling/headless/types';
import type { HeadlessRunResult } from '@/tooling/headless/runner';
import type { Message } from '@/lib/types';
import type { ModelMessage } from '@/lib/agent/types';
import { normalizeToolCalls, parseToolArguments } from '@/lib/agent/parsers';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import type { ToolDefinition } from '@/lib/transport/contracts';
import { isRecord } from '@/lib/utils/guards';
import type { TransportAuth } from '@/lib/auth/transport';

function normalizeContent(input: unknown): string {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (isTextRecord(entry)) {
          return typeof entry.text === 'string' ? entry.text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (isTextRecord(input)) {
    return typeof input.text === 'string' ? input.text : '';
  }
  return '';
}

function extractAssistantText(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const choice = choices[0];
  if (!isRecord(choice)) return '';
  const message = choice.message;
  if (!isRecord(message)) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return normalizeContent(content);
  return '';
}

function pushWithLimit(history: ModelMessage[], entry: ModelMessage, maxSize: number): void {
  history.push(entry);
  const overflow = history.length - maxSize;
  if (overflow > 0) {
    const startIndex = history.findIndex((item) => item.role !== 'system');
    if (startIndex >= 0) {
      const removable = Math.min(overflow, history.length - startIndex);
      history.splice(startIndex, removable);
    }
  }
}

export type LLMUserSimulatorOptions = {
  personaPrompt?: string;
  modelId: string;
  auth: TransportAuth;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  memoryDepth?: number;
  knowledgeGaps?: Array<{ topicId: string; misconception?: string }>;
  toolDefinitions?: ToolDefinition[];
};

export type StudentSimulatorToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type LLMUserSimulatorResponse = {
  text: string;
  toolCalls: StudentSimulatorToolCall[];
};

function fallbackStudentText(toolCalls: StudentSimulatorToolCall[]): string {
  if (toolCalls.some((call) => call.name === 'mark_topic_known')) {
    return 'I already know this topic well. Please skip ahead to the next one.';
  }
  if (toolCalls.length > 0) {
    return 'I updated my learning panel based on my confidence. Can we continue?';
  }
  return 'I need a moment to think about that.';
}

export class LLMUserSimulator {
  private readonly history: ModelMessage[];
  private readonly persona: string;
  private readonly options: LLMUserSimulatorOptions;
  private readonly maxTurns: number;
  private readonly knowledgeGaps: Array<{ topicId: string; misconception?: string }>;
  private readonly toolDefinitions: ToolDefinition[];

  constructor(options: LLMUserSimulatorOptions) {
    this.options = {
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 256,
      memoryDepth: 12,
      ...options,
    };
    this.knowledgeGaps = Array.isArray(options.knowledgeGaps) ? options.knowledgeGaps : [];
    this.toolDefinitions = Array.isArray(options.toolDefinitions) ? options.toolDefinitions : [];
    const basePersona =
      options.personaPrompt ??
      [
        'You are simulating a diligent student interacting with a tutor.',
        'Respond authentically, succinctly (2-4 sentences), and reference your understanding or confusion.',
        'Accept helpful guidance, ask clarifying questions when needed, and occasionally reflect on what you learned.',
        'Avoid meta commentary about being an AI and do not invent capabilities beyond a human student.',
      ].join(' ');
    const gapBlock = this.knowledgeGaps.length
      ? [
          'Known misconceptions to maintain unless explicitly corrected by the tutor:',
          ...this.knowledgeGaps.map(
            (gap) => `- ${gap.topicId}: ${gap.misconception ?? 'You are unsure about this topic.'}`,
          ),
          'Only update your understanding when the tutor clearly addresses the misconception.',
        ].join('\n')
      : '';
    this.persona = [basePersona, gapBlock].filter(Boolean).join('\n');
    this.maxTurns = this.options.memoryDepth ?? 12;
    this.history = [{ role: 'system', content: this.persona }];
  }

  async initialMessage(goal: string): Promise<string> {
    const prompt = [
      'The tutor has just arrived to help you.',
      `Briefly explain what you want help with: ${goal || 'a subject you are learning'}.`,
      'Greet the tutor warmly and mention any constraints (timeline, upcoming exam, etc.) if relevant.',
    ].join('\n');
    const response = await this.generate(prompt);
    return response.text;
  }

  async respond(
    tutorMessage: string,
    context?: {
      planSummary?: string;
      planEditable?: boolean;
      learnerModelSummary?: string;
      learnerModelEditable?: boolean;
      turn?: number;
    },
  ): Promise<string> {
    const response = await this.respondWithTools(tutorMessage, context);
    return response.text;
  }

  async respondWithTools(
    tutorMessage: string,
    context?: {
      planSummary?: string;
      planEditable?: boolean;
      learnerModelSummary?: string;
      learnerModelEditable?: boolean;
      turn?: number;
    },
  ): Promise<LLMUserSimulatorResponse> {
    const cues: string[] = [
      tutorMessage,
      '',
      'Reply as the student. Clarify doubts, show your thinking, and mention if you feel ready to proceed.',
    ];
    if (context?.planSummary) {
      cues.push(`Learning plan context: ${context.planSummary}`);
      if (context.planEditable) {
        cues.push(
          'The learning plan on screen is yours to shape. You are the kind of student who takes charge of your own learning — you know your weak spots and your deadline. When the topic order does not match your priorities, you directly ask the tutor to change the plan. For example, you might say "Can you move the practice problems before the theory?" or "I want to skip topic X and jump to Y" or "Can we reorder the plan to start with what I need most for the exam?" You do not just hint — you make clear requests for the tutor to update the plan.',
        );
      }
      // Non-editable: no plan agency cue. The plan is visible but the student
      // does not comment on ordering or request changes (ChatTutor-equivalent).
    }
    if (context?.learnerModelSummary) {
      cues.push(`Your mastery scores (visible on screen): ${context.learnerModelSummary}`);
      if (context.learnerModelEditable) {
        cues.push(
          'These mastery scores are editable — you can ask the tutor to correct them. Look at the scores and compare them to what you actually know. When a score does not match your real confidence, tell the tutor directly. For example: "That 40% on power rule is too low — I can do basic power rule problems fine, it should be higher" or "The score on sum rule is too high, I\'m actually still confused about when to use it." You do not silently accept scores that feel wrong — you speak up so the tutor can fix them.',
        );
        if (this.toolDefinitions.length > 0) {
          cues.push(
            'When you use learning-panel controls, call tools directly: adjust_mastery, mark_topic_known, flag_for_review, resolve_misconception. You can still send a short normal chat reply in the same turn.',
          );
        }
      }
      // Non-editable: no mastery agency cue. Scores are visible but the student
      // does not contest or request corrections (passive OLM display).
    }
    if (this.knowledgeGaps.length > 0) {
      cues.push(
        'Reminder: maintain your known misconceptions unless the tutor clearly corrected them in this turn.',
      );
    }
    if ((context?.turn ?? 0) > 4) {
      cues.push('If you feel confident, you may summarize your learning or request to wrap up.');
    }
    const prompt = cues.join('\n');
    return this.generate(prompt);
  }

  private async generate(userContent: string): Promise<LLMUserSimulatorResponse> {
    pushWithLimit(this.history, { role: 'user', content: userContent }, this.maxTurns);
    const response = await getChatCompletion()({
      auth: this.options.auth,
      model: this.options.modelId,
      messages: this.history,
      temperature: this.options.temperature,
      topP: this.options.topP,
      maxTokens: this.options.maxTokens,
      tools: this.toolDefinitions.length > 0 ? this.toolDefinitions : undefined,
      toolChoice: this.toolDefinitions.length > 0 ? 'auto' : undefined,
      parallelToolCalls: false,
    });
    const firstChoice = isRecord(response?.choices?.[0]) ? response.choices?.[0] : undefined;
    const message = isRecord(firstChoice?.message) ? firstChoice.message : undefined;
    const toolCalls = message
      ? normalizeToolCalls(message).map((call) => ({
          id: call.id,
          name: call.function.name,
          args: parseToolArguments(call),
        }))
      : [];
    const text = (extractAssistantText(response) || fallbackStudentText(toolCalls)).trim();
    pushWithLimit(this.history, { role: 'assistant', content: text }, this.maxTurns);
    return { text, toolCalls };
  }
}

export type LLMJudgeOptions = {
  modelId: string;
  auth: TransportAuth;
  rubricPrompt?: string;
  maxTokens?: number;
  temperature?: number;
};

export type LLMJudgeInput =
  | Message[]
  | (Partial<HeadlessRunResult> & {
      goal?: string;
      transcript?: string;
      messages?: Message[];
      snapshots?: HeadlessTurnSnapshot[];
    });

type NormalizedJudgeInput = {
  messages?: Message[];
  snapshots?: HeadlessTurnSnapshot[];
  transcript?: string;
  goal?: string;
};

function normalizeJudgeInput(input: LLMJudgeInput, contextGoal?: string): NormalizedJudgeInput {
  if (Array.isArray(input)) {
    return { messages: input, goal: contextGoal };
  }
  const payload = isRecord(input) ? input : {};
  return {
    messages: Array.isArray(payload.messages) ? (payload.messages as Message[]) : undefined,
    snapshots: Array.isArray(payload.snapshots)
      ? (payload.snapshots as HeadlessTurnSnapshot[])
      : undefined,
    transcript: typeof payload.transcript === 'string' ? payload.transcript : undefined,
    goal: typeof payload.goal === 'string' ? payload.goal : contextGoal,
  };
}

function isTextRecord(value: unknown): value is { text?: unknown } {
  return !!value && typeof value === 'object' && 'text' in value;
}

function buildSnapshotSignals(snapshots?: HeadlessTurnSnapshot[]): string[] {
  if (!snapshots || snapshots.length === 0) return [];
  const total = snapshots.length;
  const toolTurns = snapshots.filter((snap) => (snap.assistant.toolCalls?.length ?? 0) > 0).length;
  const tutorUiTurns = snapshots.filter((snap) => snap.assistant.tutorUi).length;
  const learnerTurns = snapshots.filter(
    (snap) => snap.plan.learnerModel || snap.assistant.learnerModel,
  ).length;
  const planUpdates = snapshots.reduce((sum, snap) => {
    const updates = snap.plan.planUpdates;
    const statusChanges = updates?.statusChanges?.length ?? 0;
    const masteryChanges = updates?.masteryChanges?.length ?? 0;
    return sum + statusChanges + masteryChanges;
  }, 0);
  const searchTurns = snapshots.filter((snap) => snap.plan.hasSearchResults).length;
  const reasoningTurns = snapshots.filter(
    (snap) => snap.assistant.reasoning && snap.assistant.reasoning.trim().length > 0,
  ).length;

  const signals: string[] = [];
  signals.push(`turns: ${total}`);
  if (toolTurns) signals.push(`tool calls in ${toolTurns} turn${toolTurns === 1 ? '' : 's'}`);
  if (tutorUiTurns)
    signals.push(`tutor UI payload in ${tutorUiTurns} turn${tutorUiTurns === 1 ? '' : 's'}`);
  if (searchTurns)
    signals.push(`search cited in ${searchTurns} turn${searchTurns === 1 ? '' : 's'}`);
  if (learnerTurns)
    signals.push(`learner model touched in ${learnerTurns} turn${learnerTurns === 1 ? '' : 's'}`);
  if (planUpdates) signals.push(`plan updates recorded: ${planUpdates}`);
  if (reasoningTurns)
    signals.push(`reasoning traces in ${reasoningTurns} turn${reasoningTurns === 1 ? '' : 's'}`);
  return signals;
}

export class LLMJudge {
  private readonly options: Required<Pick<LLMJudgeOptions, 'modelId' | 'auth'>> &
    Pick<LLMJudgeOptions, 'rubricPrompt' | 'maxTokens' | 'temperature'>;
  private readonly rubric: string;

  constructor(options: LLMJudgeOptions) {
    this.options = {
      modelId: options.modelId,
      auth: options.auth,
      rubricPrompt: options.rubricPrompt,
      maxTokens: options.maxTokens ?? 384,
      temperature: options.temperature ?? 0.2,
    };
    this.rubric =
      options.rubricPrompt ??
      [
        'You are evaluating an AI tutor session.',
        'Provide:',
        '1. score: integer 1-5 (5 = excellent tutoring outcomes).',
        '2. strengths: bullet list of positives.',
        '3. improvements: bullet list of actionable suggestions.',
        '4. verdict: one-sentence overall judgment.',
        'Respond in JSON like {"score":5,"strengths":["..."],"improvements":["..."],"verdict":"..."}',
      ].join('\n');
  }

  async evaluate(
    payload: LLMJudgeInput,
    context?: { goal?: string },
  ): Promise<{
    raw: string;
    verdict: string;
    score?: number;
    strengths?: string[];
    improvements?: string[];
  }> {
    const normalized = normalizeJudgeInput(payload, context?.goal);
    const transcript =
      normalized.transcript ??
      (normalized.snapshots?.length ? renderSnapshotTranscript(normalized.snapshots) : undefined) ??
      (normalized.messages?.length ? renderTutorTranscript(normalized.messages) : undefined);

    if (!transcript) {
      throw new Error('LLMJudge requires messages, snapshots, or transcript text.');
    }

    const signals = buildSnapshotSignals(normalized.snapshots);
    const userPrompt = [
      normalized.goal ? `Learner goal: ${normalized.goal}` : undefined,
      signals.length ? `Signals:\n- ${signals.join('\n- ')}` : undefined,
      'Conversation transcript:',
      transcript,
      '',
      'Return only valid JSON.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await getChatCompletion()({
      auth: this.options.auth,
      model: this.options.modelId,
      messages: [
        { role: 'system', content: this.rubric },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.options.temperature,
      maxTokens: this.options.maxTokens,
    });

    const text = extractAssistantText(response);
    return this.parseJudgment(text);
  }

  private parseJudgment(payload: string): {
    raw: string;
    verdict: string;
    score?: number;
    strengths?: string[];
    improvements?: string[];
  } {
    const fallback = {
      raw: payload,
      verdict: payload || 'No verdict provided.',
      score: undefined,
      strengths: undefined,
      improvements: undefined,
    };
    try {
      const parsed = JSON.parse(payload);
      return {
        raw: payload,
        verdict: typeof parsed.verdict === 'string' ? parsed.verdict : fallback.verdict,
        score:
          typeof parsed.score === 'number' && Number.isFinite(parsed.score)
            ? Number(parsed.score)
            : undefined,
        strengths: Array.isArray(parsed.strengths)
          ? (parsed.strengths as unknown[]).map((item) => String(item))
          : undefined,
        improvements: Array.isArray(parsed.improvements)
          ? (parsed.improvements as unknown[]).map((item) => String(item))
          : undefined,
      };
    } catch {
      return fallback;
    }
  }
}
