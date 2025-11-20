import { renderSnapshotTranscript, renderTutorTranscript } from '@/lib/headless/transcript';
import type { HeadlessTurnSnapshot } from '@/lib/headless/types';
import type { HeadlessRunResult } from '@/lib/headless/runner';
import type { ModelTransport, Message } from '@/lib/types';
import type { ModelMessage } from '@/lib/agent/types';
import { getChatCompletion } from '@/lib/agent/pipelineClient';

function normalizeContent(input: unknown): string {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && 'text' in entry) {
          const block = entry as { text?: string };
          return typeof block.text === 'string' ? block.text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (input && typeof input === 'object' && 'text' in input) {
    return typeof (input as any).text === 'string' ? ((input as any).text as string) : '';
  }
  return '';
}

function extractAssistantText(payload: any): string {
  const choice = payload?.choices?.[0];
  if (!choice) return '';
  const message = choice.message;
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) return normalizeContent(message.content);
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
  transport: ModelTransport;
  apiKey: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  memoryDepth?: number;
};

export class LLMUserSimulator {
  private readonly history: ModelMessage[];
  private readonly persona: string;
  private readonly options: LLMUserSimulatorOptions;
  private readonly maxTurns: number;

  constructor(options: LLMUserSimulatorOptions) {
    this.options = {
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 256,
      memoryDepth: 12,
      ...options,
    };
    this.persona =
      options.personaPrompt ??
      [
        'You are simulating a diligent student interacting with a tutor.',
        'Respond authentically, succinctly (2-4 sentences), and reference your understanding or confusion.',
        'Accept helpful guidance, ask clarifying questions when needed, and occasionally reflect on what you learned.',
        'Avoid meta commentary about being an AI and do not invent capabilities beyond a human student.',
      ].join(' ');
    this.maxTurns = this.options.memoryDepth ?? 12;
    this.history = [{ role: 'system', content: this.persona }];
  }

  async initialMessage(goal: string): Promise<string> {
    const prompt = [
      'The tutor has just arrived to help you.',
      `Briefly explain what you want help with: ${goal || 'a subject you are learning'}.`,
      'Greet the tutor warmly and mention any constraints (timeline, upcoming exam, etc.) if relevant.',
    ].join('\n');
    return this.generate(prompt);
  }

  async respond(tutorMessage: string, context?: { planSummary?: string; turn?: number }): Promise<string> {
    const cues: string[] = [
      tutorMessage,
      '',
      'Reply as the student. Clarify doubts, show your thinking, and mention if you feel ready to proceed.',
    ];
    if (context?.planSummary) {
      cues.push(`Learning plan context: ${context.planSummary}`);
    }
    if ((context?.turn ?? 0) > 4) {
      cues.push('If you feel confident, you may summarize your learning or request to wrap up.');
    }
    const prompt = cues.join('\n');
    return this.generate(prompt);
  }

  private async generate(userContent: string): Promise<string> {
    pushWithLimit(this.history, { role: 'user', content: userContent }, this.maxTurns);
    const response = await getChatCompletion()({
      apiKey: this.options.apiKey,
      transport: this.options.transport,
      model: this.options.modelId,
      messages: this.history,
      temperature: this.options.temperature,
      top_p: this.options.topP,
      max_tokens: this.options.maxTokens,
    });
    const text = extractAssistantText(response) || 'I need a moment to think about that.';
    pushWithLimit(this.history, { role: 'assistant', content: text }, this.maxTurns);
    return text;
  }
}

export type LLMJudgeOptions = {
  modelId: string;
  transport: ModelTransport;
  apiKey: string;
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

function normalizeJudgeInput(
  input: LLMJudgeInput,
  contextGoal?: string,
): NormalizedJudgeInput {
  if (Array.isArray(input)) {
    return { messages: input, goal: contextGoal };
  }
  const payload = input ?? {};
  return {
    messages: 'messages' in payload ? ((payload as any).messages as Message[]) : undefined,
    snapshots: 'snapshots' in payload ? ((payload as any).snapshots as HeadlessTurnSnapshot[]) : undefined,
    transcript: (payload as any).transcript,
    goal: (payload as any).goal ?? contextGoal,
  };
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
  private readonly options: Required<Pick<LLMJudgeOptions, 'modelId' | 'transport' | 'apiKey'>> &
    Pick<LLMJudgeOptions, 'rubricPrompt' | 'maxTokens' | 'temperature'>;
  private readonly rubric: string;

  constructor(options: LLMJudgeOptions) {
    this.options = {
      modelId: options.modelId,
      transport: options.transport,
      apiKey: options.apiKey,
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

  async evaluate(payload: LLMJudgeInput, context?: { goal?: string }): Promise<{
    raw: string;
    verdict: string;
    score?: number;
    strengths?: string[];
    improvements?: string[];
  }> {
    const normalized = normalizeJudgeInput(payload, context?.goal);
    const transcript =
      normalized.transcript ??
      (normalized.snapshots?.length
        ? renderSnapshotTranscript(normalized.snapshots)
        : undefined) ??
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
      apiKey: this.options.apiKey,
      transport: this.options.transport,
      model: this.options.modelId,
      messages: [
        { role: 'system', content: this.rubric },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.options.temperature,
      max_tokens: this.options.maxTokens,
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
