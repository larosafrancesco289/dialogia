#!/usr/bin/env tsx
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HeadlessTutorSession, type HeadlessTurnArtifacts } from '@/lib/headless/session';
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

type PresetDefinition = {
  goal: string;
  description: string;
  turns?: number;
  initialUser?: string;
  tutorModel?: string;
  studentModel?: string;
  judgeModel?: string;
};

const PRESET_SCENARIOS: Record<string, PresetDefinition> = {
  python_basics: {
    goal: 'I want to learn Python fundamentals for scripting and automation.',
    description: 'Entry-level programming learner requesting a structured Python plan.',
    turns: 5,
    initialUser: 'Hi tutor! I want to learn Python so I can automate simple tasks.',
  },
  data_science_refresh: {
    goal: 'Help me refresh core statistics and Python data science workflows.',
    description: 'Intermediate learner focused on applied statistics and Python tooling.',
    turns: 4,
  },
  ap_calculus: {
    goal: 'Prepare me for the AP Calculus AB exam with practice and review.',
    description: 'High school learner targeting AP Calculus AB preparation.',
    turns: 6,
  },
};

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
      '  --goal "<text>"            Goal or scenario for the student (required unless --preset)',
      '  --preset <name>           Use a predefined scenario (see --list-presets)',
      '  --list-presets            Show built-in preset names and descriptions',
      '  --turns <n>                Maximum tutor turns (default: 4)',
      '  --tutor-model <id>         Model ID for tutor agent',
      '  --student-model <id>       Model ID for simulated student',
      '  --judge-model <id>         Model ID for judge evaluation',
      '  --openrouter-key <key>     OpenRouter API key (default from env)',
      '  --anthropic-key <key>      Anthropic API key (optional, required for native anthropic models)',
      '  --initial-user "<text>"    Seed student message instead of generating',
      '  --json-out <path>          Write full JSON report to this path (defaults to tmp/)',
    ].join('\n'),
  );
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnvDefaults(): Promise<void> {
  const envFiles = ['.env.local', '.env'];
  for (const filename of envFiles) {
    try {
      const fullPath = path.resolve(process.cwd(), filename);
      const content = await fs.readFile(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        if (!key) continue;
        if (process.env[key]) continue;
        const value = normalizeEnvValue(line.slice(idx + 1));
        if (!value) continue;
        process.env[key] = value.replace(/\\n/g, '\n');
      }
    } catch {
      // Missing env file is fine; continue to the next candidate.
    }
  }
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
  composition: HeadlessTurnArtifacts['composition'];
  toolCalls?: ToolCallLogEntry[];
  tutorUi?: Record<string, unknown>;
  plan: PlanTurnResult;
  debugPayload?: string;
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

function summarizeToolDefinitions(
  tools: HeadlessTurnArtifacts['composition']['tools'],
): string {
  if (!tools || tools.length === 0) return 'none';
  const names = tools.map((tool) => tool.function?.name ?? '(unnamed)');
  return names.join(', ');
}

function summarizePlugins(plugins: HeadlessTurnArtifacts['composition']['plugins']): string {
  if (!plugins || plugins.length === 0) return 'none';
  return plugins.map((plugin) => plugin.id).join(', ');
}

function previewTextBlock(text: string | undefined, maxLines = 4): string[] {
  if (!text) return ['(none)'];
  const wrapped = wrapText(text);
  const lines = wrapped.slice(0, maxLines);
  if (wrapped.length > maxLines) lines.push('...');
  return lines;
}

function summarizePlanFlags(plan: PlanTurnResult): string {
  const segments: string[] = [];
  if (plan.learnerModel) segments.push('learner model updated');
  if (plan.planUpdates) segments.push('plan updated');
  if (plan.usedTutorContentTool) segments.push('inline tutor UI');
  if (plan.hasSearchResults) segments.push('search results cited');
  return segments.length ? segments.join(', ') : 'no tutor tool usage';
}

function summarizePlanUpdates(plan: PlanTurnResult): string[] {
  const updates = plan.planUpdates;
  if (!updates) return ['(no plan deltas)'];

  const lines: string[] = [];
  if (updates.statusChanges?.length) {
    lines.push(`status changes: ${updates.statusChanges.length}`);
  }
  if (updates.masteryChanges?.length) {
    lines.push(`mastery changes: ${updates.masteryChanges.length}`);
  }
  if (!lines.length) return ['(no plan deltas)'];
  return lines;
}

function learnerModelSummary(plan: PlanTurnResult): string | undefined {
  if (!plan.learnerModel) return undefined;
  const mastery = plan.learnerModel.mastery ?? {};
  const nodeCount = Object.keys(mastery).length;
  const avg = plan.learnerModel.globalMetrics?.averageConfidence;
  const avgPct = typeof avg === 'number' ? `${Math.round(avg * 100)}% avg confidence` : undefined;
  const parts = [`nodes tracked: ${nodeCount}`];
  if (avgPct) parts.push(avgPct);
  return parts.join(', ');
}

function printToolCallDetails(entries: ToolCallLogEntry[] | undefined) {
  if (!entries || entries.length === 0) {
    console.log('Tool calls: none');
    return;
  }
  console.log('Tool calls:');
  entries.forEach((entry) => {
    const status = entry.status === 'success' ? '✓' : entry.status === 'error' ? '✕' : '…';
    const meta: string[] = [];
    if (typeof entry.duration === 'number') meta.push(`${Math.round(entry.duration)}ms`);
    if (entry.metadata?.provider) meta.push(`provider=${entry.metadata.provider}`);
    if (entry.metadata?.modelUsed) meta.push(`model=${entry.metadata.modelUsed}`);
    if (entry.metadata?.round) meta.push(`round=${entry.metadata.round}`);
    const metaSuffix = meta.length ? ` (${meta.join(', ')})` : '';
    console.log(`  ${status} ${entry.name}${metaSuffix}`);
    if (entry.category) {
      console.log(`    category: ${entry.category}`);
    }
    const inputKeys = Object.keys(entry.input ?? {});
    if (inputKeys.length) {
      console.log(`    input: ${JSON.stringify(entry.input)}`);
    }
    if (entry.output && Object.keys(entry.output).length) {
      console.log(`    output: ${JSON.stringify(entry.output)}`);
    }
    if (entry.error) {
      console.log(`    error: ${entry.error}`);
    }
  });
}

function printTutorUiSummary(tutorUi: Record<string, unknown> | undefined) {
  if (!tutorUi) {
    console.log('Tutor UI: none');
    return;
  }
  const summary = summarizePlan(tutorUi);
  if (summary) {
    console.log(`Tutor UI: ${summary}`);
  } else {
    console.log('Tutor UI: (available -- see JSON report)');
  }
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
    console.log('Student message:');
    indentLines(wrapText(turn.student)).forEach((line) => console.log(line));
    console.log('Tutor response:');
    indentLines(wrapText(turn.tutor)).forEach((line) => console.log(line));

    console.log('\nComposition');
    console.log('-----------');
    console.log(`  Should plan: ${turn.composition.shouldPlan ? 'yes' : 'no'}`);
    console.log(`  Tools configured: ${summarizeToolDefinitions(turn.composition.tools)}`);
    console.log(`  Plugins: ${summarizePlugins(turn.composition.plugins)}`);
    if (turn.composition.providerSort) {
      console.log(`  Provider sort: ${JSON.stringify(turn.composition.providerSort)}`);
    }
    if (turn.composition.system) {
      console.log('  System prompt preview:');
      indentLines(previewTextBlock(turn.composition.system), '    ').forEach((line) =>
        console.log(line),
      );
    }

    console.log('\nPlanning Artifacts');
    console.log('------------------');
    console.log(`  Flags: ${summarizePlanFlags(turn.plan)}`);
    const learnerSummary = learnerModelSummary(turn.plan);
    if (learnerSummary) console.log(`  Learner model: ${learnerSummary}`);
    console.log('  Plan deltas:');
    indentLines(summarizePlanUpdates(turn.plan), '    ').forEach((line) => console.log(line));
    if (turn.plan.finalSystem) {
      console.log('  Final system preview:');
      indentLines(previewTextBlock(turn.plan.finalSystem), '    ').forEach((line) =>
        console.log(line),
      );
    }

    console.log('');
    printToolCallDetails(turn.toolCalls);
    printTutorUiSummary(turn.tutorUi);
    console.log(`Debug payload: ${turn.debugPayload ? 'available (see JSON report)' : 'none'}`);
    console.log('');
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

  console.log('\nArtifacts');
  console.log('---------');
  console.log(`  JSON report: ${jsonPath}`);
  console.log('Opened best with your editor, `less`, or `jq` for deeper inspection.\n');
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

  if (args['list-presets']) {
    console.log('\nAvailable presets:\n');
    Object.entries(PRESET_SCENARIOS).forEach(([name, preset]) => {
      const details = [`  ${name}`];
      details.push(`    Goal: ${preset.goal}`);
      details.push(`    Turns: ${preset.turns ?? 4}`);
      if (preset.initialUser) details.push(`    Initial student: ${preset.initialUser}`);
      details.push(`    ${preset.description}`);
      console.log(details.join('\n'));
      console.log('');
    });
    return;
  }

  if (args.help) {
    usage();
    return;
  }

  await loadEnvDefaults();

  const presetName = coerceString(args.preset)?.toLowerCase();
  const preset = presetName ? PRESET_SCENARIOS[presetName] : undefined;
  if (presetName && !preset) {
    const options = Object.keys(PRESET_SCENARIOS).join(', ');
    throw new Error(`Unknown preset "${presetName}". Available presets: ${options}`);
  }

  const goalArg = coerceString(args.goal);
  const goal = goalArg?.trim() || preset?.goal;
  if (!goal) {
    usage();
    throw new Error('Missing required --goal argument (or use --preset).');
  }

  const turns = Math.max(1, coerceInt(args.turns, preset?.turns ?? 4));
  const tutorModel =
    typeof args['tutor-model'] === 'string' && args['tutor-model']
      ? args['tutor-model']
      : preset?.tutorModel ?? DEFAULT_TUTOR_MODEL_ID;
  const studentModel =
    typeof args['student-model'] === 'string' && args['student-model']
      ? args['student-model']
      : preset?.studentModel ?? DEFAULT_MODEL_ID;
  const judgeModel =
    typeof args['judge-model'] === 'string' && args['judge-model']
      ? args['judge-model']
      : preset?.judgeModel ?? DEFAULT_MODEL_ID;

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
    composition: HeadlessTurnArtifacts['composition'];
    toolCalls?: ToolCallLogEntry[];
    tutorUi?: Record<string, unknown>;
    plan: PlanTurnResult;
    debugPayload?: string;
  }> = [];

  let studentMessage =
    typeof args['initial-user'] === 'string'
      ? args['initial-user']
      : preset?.initialUser ?? (await studentSim.initialMessage(goal));

  if (presetName) {
    console.log(
      `Using preset "${presetName}" -- goal "${goal}" (${turns} turn${
        turns === 1 ? '' : 's'
      }).\n`,
    );
  }

  for (let turn = 1; turn <= turns; turn += 1) {
    const turnResult = await session.runTurn(studentMessage);
    const tutorUi = (turnResult.artifacts.tutorUi ?? undefined) as
      | Record<string, unknown>
      | undefined;

    turnsReport.push({
      turn,
      user: turnResult.user.content,
      assistant: turnResult.assistant.content,
      composition: turnResult.artifacts.composition,
      toolCalls: turnResult.artifacts.toolCalls,
      tutorUi,
      plan: turnResult.artifacts.plan,
      debugPayload: turnResult.artifacts.debugPayload,
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
      composition: entry.composition,
      toolCalls: entry.toolCalls,
      tutorUi: entry.tutorUi,
      plan: entry.plan,
      debugPayload: entry.debugPayload,
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
