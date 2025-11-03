#!/usr/bin/env tsx
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HeadlessTutorSession } from '@/lib/headless/session';
import { LLMJudge, LLMUserSimulator } from '@/lib/headless/simulators';
import { createModelIndex } from '@/lib/models';
import type { Chat, Message, ORModel, ModelTransport, ToolCallLogEntry } from '@/lib/types';
import type { PlanTurnResult } from '@/lib/agent/types';
import { fetchModels } from '@/lib/openrouter';
import { resolveModelTransport } from '@/lib/providers';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/policy';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { CURATED_MODELS } from '@/data/curatedModels';

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): ArgMap {
  const result: ArgMap = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('-')) continue;
    if (token === '-h' || token === '--help') {
      result.help = true;
      continue;
    }
    if (token.startsWith('--')) {
      const eqIndex = token.indexOf('=');
      if (eqIndex > 2) {
        const key = token.slice(2, eqIndex);
        const value = token.slice(eqIndex + 1);
        result[key] = value;
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          result[key] = next;
          i += 1;
        } else {
          result[key] = true;
        }
      }
    }
  }
  return result;
}

function usage() {
  console.log(
    [
      'Usage: npm run tutor:simulate -- --goal "Study topic" [options]',
      '',
      'Options:',
      '  --goal "<text>"            Goal or scenario for the student (required)',
      '  --turns <n>                Maximum tutor turns (default: 4)',
      '  --tutor-model <id>         Model ID for tutor agent',
      '  --student-model <id>       Model ID for simulated student',
      '  --judge-model <id>         Model ID for judge evaluation',
      '  --openrouter-key <key>     OpenRouter API key (default from env)',
      '  --anthropic-key <key>      Anthropic API key (optional, required for native anthropic models)',
      '  --initial-user "<text>"    Seed student message instead of generating',
    ].join('\n'),
  );
}

function coerceInt(value: string | boolean | undefined, fallback: number): number {
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

async function safeFetchModels(key: string | undefined): Promise<ORModel[]> {
  if (!key) return [];
  try {
    return await fetchModels(key);
  } catch {
    return [];
  }
}

function createStubModel(id: string, transport: ModelTransport, supportsTools: boolean): ORModel {
  const supported: string[] = supportsTools ? ['tools', 'reasoning'] : ['reasoning'];
  const curated = CURATED_MODELS.find((model) => model.id === id);
  return {
    id,
    name: curated?.name ?? id,
    transport,
    context_length: 16000,
    raw: { supported_parameters: supported },
  };
}

function resolveApiKeyFactory(keys: {
  openrouter?: string;
  anthropic?: string;
}): (params: { modelId: string; transport: ModelTransport }) => string {
  return ({ transport, modelId }) => {
    if (transport === 'anthropic') {
      if (!keys.anthropic) {
        throw new Error(
          `Anthropic transport requested for ${modelId}, but no ANTHROPIC_API_KEY (or --anthropic-key) provided.`,
        );
      }
      return keys.anthropic;
    }
    if (!keys.openrouter) {
      throw new Error(
        `OpenRouter transport requested for ${modelId}, but no OPENROUTER_API_KEY (or --openrouter-key) provided.`,
      );
    }
    return keys.openrouter;
  };
}

function summarizePlan(tutorUi: Record<string, unknown> | undefined): string | undefined {
  if (!tutorUi) return undefined;
  const session = tutorUi.session as Record<string, unknown> | undefined;
  if (!session) return undefined;
  const parts: string[] = [];
  if (typeof session.goal === 'string') parts.push(`Goal: ${session.goal}`);
  if (typeof session.stage === 'string') parts.push(`Stage: ${session.stage}`);
  if (Array.isArray(session.skills) && session.skills.length) {
    parts.push(`Skills: ${(session.skills as unknown[]).map(String).join(', ')}`);
  }
  if (typeof session.next === 'string') parts.push(`Next: ${session.next}`);
  return parts.join(' · ');
}

type SimulationTurn = {
  turn: number;
  student: string;
  tutor: string;
  toolCalls?: ToolCallLogEntry[];
  tutorUi?: Record<string, unknown>;
  plan: PlanTurnResult;
};

type SimulationReport = {
  goal: string;
  tutorModel: string;
  studentModel: string;
  judgeModel: string;
  turns: SimulationTurn[];
  transcript: Array<{
    id: string;
    role: Message['role'];
    content: string;
    hiddenContent?: string;
    tutor?: unknown;
    learnerModel?: Message['learnerModel'];
    planUpdates?: Message['planUpdates'];
    toolCalls?: ToolCallLogEntry[];
  }>;
  judge: {
    raw: string;
    verdict: string;
    score?: number;
    strengths?: string[];
    improvements?: string[];
  };
};

function coerceString(value: string | boolean | undefined): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

function wrapText(input: string, width = 90): string[] {
  const normalized = input ?? '';
  if (normalized.trim().length === 0) return ['(no content)'];
  const words = normalized.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
      if (current.length > width) {
        lines.push(current);
        current = '';
      }
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

function formatToolCalls(entries: ToolCallLogEntry[] | undefined): string {
  if (!entries || entries.length === 0) return 'none';
  return entries
    .map((entry) => {
      const status = entry.status === 'success' ? '✓' : entry.status === 'error' ? '✕' : '…';
      return `${status} ${entry.name}`;
    })
    .join(', ');
}

function formatLearnerSummary(plan: PlanTurnResult) {
  const segments: string[] = [];
  if (plan.learnerModel) segments.push('learner model updated');
  if (plan.planUpdates) segments.push('plan updated');
  if (plan.usedTutorContentTool) segments.push('inline tutor UI');
  if (plan.hasSearchResults) segments.push('search results cited');
  return segments.length ? segments.join(', ') : 'no tutor tool usage';
}

function indentLines(lines: string[], indent = '  '): string[] {
  return lines.map((line) => `${indent}${line}`);
}

function printSummary(report: SimulationReport, jsonPath: string) {
  console.log('\n=== Headless Tutor Simulation ===');
  console.log(`Goal:         ${report.goal}`);
  console.log(`Tutor model:  ${report.tutorModel}`);
  console.log(`Student model: ${report.studentModel}`);
  console.log(`Judge model:  ${report.judgeModel}`);
  console.log(`Turns:        ${report.turns.length}`);
  console.log('');

  report.turns.forEach((turn) => {
    printSection(`Turn ${turn.turn}`);
    console.log('Student:');
    indentLines(wrapText(turn.student)).forEach((line) => console.log(line));
    console.log('Tutor:');
    indentLines(wrapText(turn.tutor)).forEach((line) => console.log(line));
    console.log(`Tool calls: ${formatToolCalls(turn.toolCalls)}`);
    console.log(`Plan summary: ${formatLearnerSummary(turn.plan)}`);
  });

  printSection('Judge Verdict');
  if (typeof report.judge.score === 'number') {
    console.log(`Score: ${report.judge.score}/5`);
  }
  console.log(`Verdict: ${report.judge.verdict}`);
  if (Array.isArray(report.judge.strengths) && report.judge.strengths.length) {
    console.log('Strengths:');
    report.judge.strengths.forEach((item) => console.log(`  • ${item}`));
  }
  if (Array.isArray(report.judge.improvements) && report.judge.improvements.length) {
    console.log('Improvements:');
    report.judge.improvements.forEach((item) => console.log(`  • ${item}`));
  }

  console.log('\nFull JSON report saved to:');
  console.log(`  ${jsonPath}`);
  console.log('Open in your editor or run `jq`/`less` for deeper inspection.\n');
}

async function writeReport(
  report: SimulationReport,
  requestedPath: string | boolean | undefined,
): Promise<string> {
  const preferred = coerceString(requestedPath);
  const resolvedPath =
    preferred && preferred.trim().length > 0
      ? path.resolve(process.cwd(), preferred)
      : path.resolve(process.cwd(), 'tmp', `tutor-sim-${Date.now()}.json`);
  const targetDir = path.dirname(resolvedPath);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(resolvedPath, JSON.stringify(report, null, 2), 'utf8');
  return resolvedPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const goalArg = args.goal;
  if (typeof goalArg !== 'string' || goalArg.trim().length === 0) {
    usage();
    throw new Error('Missing required --goal argument.');
  }
  const goal = goalArg.trim();

  const turns = Math.max(1, coerceInt(args.turns, 4));
  const tutorModel =
    typeof args['tutor-model'] === 'string' && args['tutor-model']
      ? args['tutor-model']
      : DEFAULT_TUTOR_MODEL_ID;
  const studentModel =
    typeof args['student-model'] === 'string' && args['student-model']
      ? args['student-model']
      : DEFAULT_MODEL_ID;
  const judgeModel =
    typeof args['judge-model'] === 'string' && args['judge-model']
      ? args['judge-model']
      : DEFAULT_MODEL_ID;

  const openrouterKey =
    (typeof args['openrouter-key'] === 'string' && args['openrouter-key']) ||
    process.env.OPENROUTER_API_KEY ||
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
  const anthropicKey =
    (typeof args['anthropic-key'] === 'string' && args['anthropic-key']) ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;

  const remoteModels = await safeFetchModels(openrouterKey);
  const allModelIds = Array.from(new Set([tutorModel, studentModel, judgeModel]));
  const models: ORModel[] = allModelIds.map((id) => {
    const fromRemote = remoteModels.find((m) => m.id === id);
    if (fromRemote) return fromRemote;
    const transport = resolveModelTransport(id, fromRemote);
    const supportsTools = id === tutorModel;
    return createStubModel(id, transport, supportsTools);
  });

  const chat: Chat = {
    id: `chat_${uuidv4()}`,
    title: `Headless Tutor · ${goal.slice(0, 40)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      model: tutorModel,
      tutor_mode: true,
      tutor_default_model: tutorModel,
      enableLearnerModel: true,
      system: DEFAULT_BASE_SYSTEM,
      search_enabled: false,
      search_provider: 'openrouter',
      showToolCallLog: true,
      showDebugRawJson: true,
    },
  };

  const resolveApiKey = resolveApiKeyFactory({ openrouter: openrouterKey, anthropic: anthropicKey });

  const modelIndex = createModelIndex(models);

  const session = new HeadlessTutorSession({
    chat,
    models,
    modelIndex,
    resolveApiKey,
    uiOverrides: {
      debugMode: true,
      experimentalTutor: true,
      forceTutorMode: true,
      nextTutorMode: true,
    },
  });

  const studentTransport = resolveModelTransport(
    studentModel,
    models.find((m) => m.id === studentModel),
  );
  const studentSim = new LLMUserSimulator({
    modelId: studentModel,
    transport: studentTransport,
    apiKey: resolveApiKey({ modelId: studentModel, transport: studentTransport }),
  });

  const judgeTransport = resolveModelTransport(judgeModel, models.find((m) => m.id === judgeModel));
  const judge = new LLMJudge({
    modelId: judgeModel,
    transport: judgeTransport,
    apiKey: resolveApiKey({ modelId: judgeModel, transport: judgeTransport }),
  });

  const turnsReport: Array<{
    turn: number;
    user: string;
    assistant: string;
    toolCalls?: ToolCallLogEntry[];
    tutorUi?: Record<string, unknown>;
    plan: PlanTurnResult;
  }> = [];

  let studentMessage =
    typeof args['initial-user'] === 'string'
      ? args['initial-user']
      : await studentSim.initialMessage(goal);

  for (let turn = 1; turn <= turns; turn += 1) {
    const turnResult = await session.runTurn(studentMessage);
    const tutorUi = (turnResult.artifacts.tutorUi ?? undefined) as
      | Record<string, unknown>
      | undefined;

    turnsReport.push({
      turn,
      user: turnResult.user.content,
      assistant: turnResult.assistant.content,
      toolCalls: turnResult.artifacts.toolCalls,
      tutorUi,
      plan: turnResult.artifacts.plan,
    });

    if (turn === turns) break;

    const planSummary = summarizePlan(tutorUi);
    studentMessage = await studentSim.respond(turnResult.assistant.content, {
      planSummary,
      turn,
    });
  }

  const transcript: Message[] = session.getMessages();
  const judgeAssessment = await judge.evaluate(transcript, { goal });

  const output = {
    goal,
    tutorModel,
    studentModel,
    judgeModel,
    turns: turnsReport.map((entry) => ({
      turn: entry.turn,
      student: entry.user,
      tutor: entry.assistant,
      toolCalls: entry.toolCalls,
      tutorUi: entry.tutorUi,
      plan: entry.plan,
    })),
    transcript: transcript.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      hiddenContent: (msg as any).hiddenContent,
      tutor: (msg as any).tutor,
      learnerModel: msg.learnerModel,
      planUpdates: msg.planUpdates,
      toolCalls: msg.toolCalls,
    })),
    judge: judgeAssessment,
  };

  const jsonPath = await writeReport(output, args['json-out']);
  printSummary(output, jsonPath);
}

main().catch((error) => {
  console.error('Tutor simulation failed:', error);
  process.exit(1);
});
