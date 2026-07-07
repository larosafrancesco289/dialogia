import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHeadlessRunner } from '@/tooling/headless/runner';
import { LLMJudge, LLMUserSimulator } from '@/tooling/headless/simulators';
import { renderSnapshotTranscript } from '@/tooling/headless/transcript';
import type { HeadlessTurnSnapshot } from '@/tooling/headless/types';
import { createModelIndex } from '@/lib/models';
import type { Chat, Message, ModelDescriptor, ModelTransport, ToolCallLogEntry } from '@/lib/types';
import type { PlanTurnResult } from '@/lib/agent/types';
import { fetchModels } from '@/lib/openrouter';
import { resolveModelTransport } from '@/lib/providers';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { resolveDynamicModelId } from '@/lib/models/dynamicDefaults';
import { CURATED_MODELS } from '@/data/curatedModels';
import { parseArgs } from '@/lib/cli/args';
import { loadEnvDefaults } from '@/lib/cli/env.node';
import { getOpenRouterKeyFallback } from '@/lib/env/keys';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { createOpenRouterAccess } from '@/lib/openrouter/pipeline';

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

function usage() {
  console.log(
    [
      'Usage: bun run tutor:simulate -- --goal "Study topic" [options]',
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
      '  --initial-user "<text>"    Seed student message instead of generating',
      '  --json-out <path>          Write full JSON report to this path (defaults to tmp/)',
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

async function safeFetchModels(auth: TransportAuth | null): Promise<ModelDescriptor[]> {
  if (!auth) return [];
  try {
    return await fetchModels(auth);
  } catch {
    return [];
  }
}

function createStubModel(
  id: string,
  transport: ModelTransport,
  supportsTools: boolean,
): ModelDescriptor {
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

function resolveAuthFactory(keys: {
  openrouter?: string;
}): (params: { modelId: string; transport: ModelTransport }) => TransportAuth {
  return ({ modelId, transport }) => {
    if (!keys.openrouter) {
      throw new Error(
        `OpenRouter transport requested for ${modelId}, but no OPENROUTER_API_KEY (or --openrouter-key) provided.`,
      );
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
  composition: HeadlessTurnSnapshot['composition'];
  toolCalls?: ToolCallLogEntry[];
  tutorUi?: HeadlessTurnSnapshot['assistant']['tutorUi'];
  plan: PlanTurnResult;
  debugPayload?: string;
  reasoning?: string;
  metrics?: Message['metrics'];
  genSettings?: Message['genSettings'];
  systemSnapshot?: string;
  hiddenContent?: string;
  learnerModelDebug?: unknown;
};

type SimulationReport = {
  goal: string;
  tutorModel: string;
  studentModel: string;
  judgeModel: string;
  turns: SimulationTurn[];
  snapshots: HeadlessTurnSnapshot[];
  messages: Message[];
  transcriptText: string;
  transcript: Array<{
    id: string;
    role: Message['role'];
    content: string;
    hiddenContent?: string;
    tutor?: unknown;
    learnerModel?: Message['learnerModel'];
    planUpdates?: Message['planUpdates'];
    toolCalls?: ToolCallLogEntry[];
    reasoning?: string;
    metrics?: Message['metrics'];
    systemSnapshot?: string;
    genSettings?: Message['genSettings'];
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

function summarizeToolDefinitions(tools: HeadlessTurnSnapshot['composition']['tools']): string {
  if (!tools || tools.length === 0) return 'none';
  const names = tools.map((tool) => tool.function?.name ?? '(unnamed)');
  return names.join(', ');
}

function summarizePlugins(plugins: HeadlessTurnSnapshot['composition']['plugins']): string {
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

function summarizeMetrics(metrics: Message['metrics'] | undefined): string | undefined {
  if (!metrics) return undefined;
  const parts: string[] = [];
  if (typeof metrics.ttftMs === 'number') parts.push(`ttft ${Math.round(metrics.ttftMs)}ms`);
  if (typeof metrics.completionMs === 'number')
    parts.push(`latency ${Math.round(metrics.completionMs)}ms`);
  if (typeof metrics.promptTokens === 'number') parts.push(`prompt ${metrics.promptTokens}`);
  if (typeof metrics.completionTokens === 'number')
    parts.push(`completion ${metrics.completionTokens}`);
  return parts.length ? parts.join(', ') : undefined;
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

function printTutorUiSummary(tutorUi: HeadlessTurnSnapshot['assistant']['tutorUi']) {
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
    const providerSort = turn.composition.settings?.generation?.providerSort;
    if (providerSort) {
      console.log(`  Provider sort: ${JSON.stringify(providerSort)}`);
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
    const metricsSummary = summarizeMetrics(turn.metrics);
    if (metricsSummary) {
      console.log(`Metrics: ${metricsSummary}`);
    }
    if (turn.reasoning) {
      console.log('Reasoning: captured (see JSON report)');
    }
    if (turn.hiddenContent) {
      console.log('Hidden tutor content: captured (see JSON report)');
    }
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

export async function runTutorSimulationCli(argv: string[]) {
  const args = parseArgs(argv);

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
      : (preset?.tutorModel ?? resolveDynamicModelId(DEFAULT_TUTOR_MODEL_ID, []));
  const studentModel =
    typeof args['student-model'] === 'string' && args['student-model']
      ? args['student-model']
      : (preset?.studentModel ?? resolveDynamicModelId(DEFAULT_MODEL_ID, []));
  const judgeModel =
    typeof args['judge-model'] === 'string' && args['judge-model']
      ? args['judge-model']
      : (preset?.judgeModel ?? resolveDynamicModelId(DEFAULT_MODEL_ID, []));

  const openrouterKey =
    (typeof args['openrouter-key'] === 'string' && args['openrouter-key']) ||
    getOpenRouterKeyFallback();

  const openrouterAuth = openrouterKey
    ? createOpenRouterAccess({
        apiKey: openrouterKey,
        tier: 'developer',
        useProxy: false,
      }).auth
    : null;
  const remoteModels = await safeFetchModels(openrouterAuth);
  const allModelIds = Array.from(new Set([tutorModel, studentModel, judgeModel]));
  const models: ModelDescriptor[] = allModelIds.map((id) => {
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
      system: DEFAULT_BASE_SYSTEM,
      modelId: tutorModel,
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
          defaultModelId: tutorModel,
          enableLearnerModel: true,
        },
      },
    },
  };

  const resolveAuth = resolveAuthFactory({
    openrouter: openrouterKey,
  });

  const modelIndex = createModelIndex(models);

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

  const studentTransport = resolveModelTransport(
    studentModel,
    models.find((m) => m.id === studentModel),
  );
  const studentSim = new LLMUserSimulator({
    modelId: studentModel,
    auth: resolveAuth({ modelId: studentModel, transport: studentTransport }),
  });

  const judgeTransport = resolveModelTransport(
    judgeModel,
    models.find((m) => m.id === judgeModel),
  );
  const judge = new LLMJudge({
    modelId: judgeModel,
    auth: resolveAuth({ modelId: judgeModel, transport: judgeTransport }),
  });

  let studentMessage =
    typeof args['initial-user'] === 'string'
      ? args['initial-user']
      : (preset?.initialUser ?? (await studentSim.initialMessage(goal)));

  if (presetName) {
    console.log(
      `Using preset "${presetName}" -- goal "${goal}" (${turns} turn${turns === 1 ? '' : 's'}).\n`,
    );
  }

  for (let turn = 1; turn <= turns; turn += 1) {
    const snapshot = await runner.runTurn({ content: studentMessage, turnIndex: turn - 1 });

    if (turn === turns) break;

    const planSummary = summarizePlan(
      snapshot.assistant.tutorUi as Record<string, unknown> | undefined,
    );
    studentMessage = await studentSim.respond(snapshot.assistant.content, {
      planSummary,
      turn,
    });
  }

  const runResult = runner.toResult();
  const transcriptText = renderSnapshotTranscript(runResult.snapshots, {
    includeHiddenContent: false,
  });
  const judgeAssessment = await judge.evaluate({
    transcript: transcriptText,
    goal,
  });

  const turnsReport = runResult.snapshots.map((snapshot, idx) => ({
    turn: idx + 1,
    student: snapshot.user.content,
    tutor: snapshot.assistant.content,
    composition: snapshot.composition,
    toolCalls: snapshot.assistant.toolCalls,
    tutorUi: snapshot.assistant.tutorUi,
    plan: snapshot.plan,
    debugPayload: snapshot.assistant.debugRequestBody,
    reasoning: snapshot.assistant.reasoning,
    metrics: snapshot.assistant.metrics,
    genSettings: snapshot.assistant.genSettings,
    systemSnapshot: snapshot.assistant.systemSnapshot,
    hiddenContent: snapshot.assistant.hiddenContent,
    learnerModelDebug: snapshot.assistant.learnerModelDebug,
  }));

  const transcript = runResult.messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    hiddenContent: msg.hiddenContent,
    tutor: msg.tutor,
    learnerModel: msg.learnerModel,
    planUpdates: msg.planUpdates,
    toolCalls: msg.toolCalls,
    reasoning: msg.reasoning,
    metrics: msg.metrics,
    systemSnapshot: msg.systemSnapshot,
    genSettings: msg.genSettings,
  }));

  const output: SimulationReport = {
    goal,
    tutorModel,
    studentModel,
    judgeModel,
    turns: turnsReport,
    snapshots: runResult.snapshots,
    messages: runResult.messages,
    transcriptText,
    transcript,
    judge: judgeAssessment,
  };

  const jsonPath = await writeReport(output, args['json-out']);
  printSummary(output, jsonPath);
}
