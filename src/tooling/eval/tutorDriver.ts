import fs from 'node:fs/promises';
import path from 'node:path';
import { createHeadlessRunner } from '@/tooling/headless/runner';
import { renderSnapshotTranscript } from '@/tooling/headless/transcript';
import { LLMUserSimulator } from '@/tooling/headless/simulators';
import { createModelIndex } from '@/lib/models';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { TutorScenario } from '@/tooling/eval/tutorScenarios';
import { buildJudgeMessages, type JudgeVerdict } from '@/tooling/eval/judgePrompts';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { resolveModelTransport } from '@/lib/providers';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type { HeadlessTurnSnapshot } from '@/tooling/headless/types';
import type { Chat, Message, ModelDescriptor, ModelTransport } from '@/lib/types';
import { getLatestLearnerModel, generateModelSummary } from '@/lib/agent/learner-model';
import { generatePlanContextPreamble } from '@/lib/agent/tutor/planContext';
import { isTutorContentTool, isTutorMetaTool, isSearchTool } from '@/lib/agent/tools/categories';
import { getOpenRouterKeyFallback } from '@/lib/env/server';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { createOpenRouterAccess } from '@/lib/openrouter/pipeline';

export type TutorEvalOptions = {
  apiKeys?: {
    openrouter?: string;
  };
  outputDir?: string;
  maxTurnsOverride?: number;
};

export type ToolUsageStats = {
  totalCalls: number;
  byName: Record<string, number>;
  contentTurns: number;
  metaCalls: number;
  searchCalls: number;
  maxContentCallsPerTurn: number;
};

export type TutorEvalResult = {
  scenario: TutorScenario;
  transcript: string;
  snapshots: HeadlessTurnSnapshot[];
  messages: Message[];
  planSummary?: string;
  learnerModelSummary?: string;
  toolUsage: ToolUsageStats;
  planTimeline?: Array<{ id: string; createdAt: number; planUpdates?: Message['planUpdates'] }>;
  learnerModelTimeline?: Array<{
    id: string;
    createdAt: number;
    learnerModel?: Message['learnerModel'];
  }>;
  judge: {
    raw: string;
    parsed?: JudgeVerdict;
  };
  outputPath?: string;
};

function createStubModel(
  id: string,
  transport: ModelTransport,
  supportsTools: boolean,
): ModelDescriptor {
  const supported: string[] = supportsTools ? ['tools', 'reasoning'] : ['reasoning'];
  return {
    id,
    name: id,
    transport,
    context_length: 16000,
    raw: { supported_parameters: supported },
  };
}

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

function isTextRecord(value: unknown): value is { text?: unknown } {
  return !!value && typeof value === 'object' && 'text' in value;
}

function resolveAuthFactory(
  keys: TutorEvalOptions['apiKeys'],
): (params: { modelId: string; transport: ModelTransport }) => TransportAuth {
  return ({ transport }) => {
    if (!keys?.openrouter) {
      throw new Error('Missing OPENROUTER_API_KEY for OpenRouter transport');
    }
    if (transport === 'openrouter') {
      return createOpenRouterAccess({
        apiKey: keys.openrouter,
        tier: 'developer',
        useProxy: false,
      }).auth;
    }
    return buildTransportAuth({ transport, apiKey: keys.openrouter, useProxy: false });
  };
}

function buildInitialStudentMessage(scenario: TutorScenario): string {
  const parts = [
    `Hi! I need help with ${scenario.topic} (${scenario.level}).`,
    `My goal: ${scenario.goal}`,
    scenario.constraints?.length ? `Constraints: ${scenario.constraints.join('; ')}` : undefined,
    `Persona: ${scenario.studentPersona}`,
  ].filter(Boolean);
  return parts.join(' ');
}

function summarizeToolUsage(snapshots: HeadlessTurnSnapshot[]): ToolUsageStats {
  const byName: Record<string, number> = {};
  let contentTurns = 0;
  let metaCalls = 0;
  let searchCalls = 0;
  let maxContentCallsPerTurn = 0;

  snapshots.forEach((snap) => {
    const toolCalls = snap.assistant.toolCalls ?? [];
    let contentThisTurn = 0;
    toolCalls.forEach((entry) => {
      const name = entry.name;
      byName[name] = (byName[name] ?? 0) + 1;
      if (isTutorContentTool(name)) {
        contentThisTurn += 1;
      } else if (isTutorMetaTool(name)) {
        metaCalls += 1;
      } else if (isSearchTool(name)) {
        searchCalls += 1;
      }
    });
    if (contentThisTurn > 0) contentTurns += 1;
    if (contentThisTurn > maxContentCallsPerTurn) {
      maxContentCallsPerTurn = contentThisTurn;
    }
  });

  const totalCalls = Object.values(byName).reduce((sum, n) => sum + n, 0);
  return { totalCalls, byName, contentTurns, metaCalls, searchCalls, maxContentCallsPerTurn };
}

async function persistResult(
  outputDir: string,
  scenarioId: string,
  payload: unknown,
): Promise<string> {
  const targetDir = path.resolve(process.cwd(), outputDir);
  await fs.mkdir(targetDir, { recursive: true });
  const filepath = path.join(targetDir, `${scenarioId}.json`);
  await fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf8');
  return filepath;
}

function parseJudgeResponse(raw: string): JudgeVerdict | undefined {
  try {
    return JSON.parse(raw) as JudgeVerdict;
  } catch {
    return undefined;
  }
}

export async function runTutorScenario(
  scenario: TutorScenario,
  options: TutorEvalOptions = {},
): Promise<TutorEvalResult> {
  const maxTurns = options.maxTurnsOverride ?? scenario.maxTurns;
  const apiKeys = {
    openrouter: options.apiKeys?.openrouter || getOpenRouterKeyFallback(),
  };
  const teacherModelId = scenario.teacherModelId || DEFAULT_TUTOR_MODEL_ID;
  const studentModelId = scenario.studentModelId || DEFAULT_MODEL_ID;
  const judgeModelId = scenario.judgeModelId || DEFAULT_MODEL_ID;

  const teacherTransport = resolveModelTransport(teacherModelId) || 'openrouter';
  const studentTransport = resolveModelTransport(studentModelId) || 'openrouter';
  const judgeTransport = resolveModelTransport(judgeModelId) || 'openrouter';

  const models: ModelDescriptor[] = [
    createStubModel(teacherModelId, teacherTransport, true),
    createStubModel(studentModelId, studentTransport, false),
    createStubModel(judgeModelId, judgeTransport, false),
  ];
  const modelIndex = createModelIndex(models);
  const resolveAuth = resolveAuthFactory(apiKeys);

  const chat: Chat = {
    id: `chat_${scenario.id}`,
    title: scenario.title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      system: DEFAULT_BASE_SYSTEM,
      modelId: teacherModelId,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: true,
        showDebugRawJson: true,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          defaultModelId: teacherModelId,
          enableLearnerModel: true,
        },
      },
    },
  };

  const runner = createHeadlessRunner({
    chat,
    models,
    modelIndex,
    resolveAuth,
    uiOverrides: {
      debug: { mode: true },
      flags: { experimentalTutor: true },
      tutor: { forceMode: true },
      overrides: { tutorMode: true },
    },
  });

  const studentSim = new LLMUserSimulator({
    modelId: studentModelId,
    auth: resolveAuth({ modelId: studentModelId, transport: studentTransport }),
    personaPrompt: [
      'You are a student in a simulated tutoring session.',
      `Topic: ${scenario.topic} (${scenario.level})`,
      `Goal: ${scenario.goal}`,
      `Persona: ${scenario.studentPersona}`,
      'Answer naturally, include mistakes that fit your persona, and ask clarifying questions when unsure.',
      scenario.constraints?.length ? `Constraints: ${scenario.constraints.join('; ')}` : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
    temperature: 0.7,
  });

  let studentMessage = buildInitialStudentMessage(scenario);
  const snapshots: HeadlessTurnSnapshot[] = [];

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const snapshot = await runner.runTurn({ content: studentMessage, turnIndex: turn });
    snapshots.push(snapshot);
    if (turn === maxTurns - 1) break;

    const tutorMessage = snapshot.assistant.content;
    const tutorUiSummary =
      snapshot.assistant.tutorUi && typeof snapshot.assistant.tutorUi === 'object'
        ? JSON.stringify(snapshot.assistant.tutorUi)
        : undefined;

    studentMessage = await studentSim.respond(tutorMessage, {
      planSummary: tutorUiSummary,
      turn,
    });
  }

  const result = runner.toResult();
  const toolUsage = summarizeToolUsage(result.snapshots);
  const transcript = renderSnapshotTranscript(result.snapshots, { includeHiddenContent: false });
  const finalPlan = runner
    .getSession()
    .getState()
    .chats.find((c) => c.id === chat.id)?.settings.features.tutor.learningPlan;
  const learnerModel = getLatestLearnerModel(result.messages);
  const planSummary =
    finalPlan && planUsageNeeded(toolUsage)
      ? generatePlanContextPreamble(finalPlan, learnerModel)
      : undefined;
  const learnerModelSummary =
    learnerModel && finalPlan ? generateModelSummary(learnerModel, finalPlan) : undefined;
  const planTimeline =
    result.messages
      ?.filter((m) => m.planUpdates)
      .map((m) => ({ id: m.id, createdAt: m.createdAt, planUpdates: m.planUpdates })) || [];
  const learnerModelTimeline =
    result.messages
      ?.filter((m) => m.learnerModel)
      .map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        learnerModel: m.learnerModel,
      })) || [];

  const judgeMessages = buildJudgeMessages({
    scenario,
    transcript,
  });
  const judgeResponse = await getChatCompletion()({
    auth: resolveAuth({ modelId: judgeModelId, transport: judgeTransport }),
    model: judgeModelId,
    messages: judgeMessages,
    temperature: 0,
    maxTokens: 256,
  });
  const judgeRaw =
    judgeResponse?.choices?.[0]?.message?.content != null
      ? normalizeContent(judgeResponse.choices[0].message.content)
      : '';
  const parsedJudge = parseJudgeResponse(judgeRaw);

  const payload: TutorEvalResult = {
    scenario,
    transcript,
    snapshots: result.snapshots,
    messages: result.messages,
    planSummary,
    learnerModelSummary,
    toolUsage,
    planTimeline,
    learnerModelTimeline,
    judge: {
      raw: judgeRaw,
      parsed: parsedJudge,
    },
  };

  if (options.outputDir) {
    payload.outputPath = await persistResult(options.outputDir, scenario.id, payload);
  }

  return payload;
}

function planUsageNeeded(stats: ToolUsageStats): boolean {
  return stats.contentTurns > 0 || stats.metaCalls > 0;
}
