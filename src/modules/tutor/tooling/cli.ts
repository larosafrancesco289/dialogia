// Module: tutor tooling cli
// Responsibility: `bun run tutor:simulate`: arguments, models and key, one simulated session,
// its JSON transcript and readable report on disk, and the --check exit code.

import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { getChatCompletion, type PipelineClient } from '@/lib/agent/pipelineClient';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { parseArgs, type ArgMap } from '@/lib/cli/args';
import { loadEnvDefaults } from '@/lib/cli/env.node';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { getOpenRouterKeyFallback } from '@/lib/env/keys';
import { fetchModels } from '@/lib/openrouter';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import type { Chat, ModelDescriptor } from '@/lib/types';
import { resolveTutorFlags, type TutorFlags } from '@/modules/tutor/engine';
import { checkRun, DEFAULT_CHECK_OPTIONS } from '@/modules/tutor/tooling/check';
import { judgeSession, type Judgement } from '@/modules/tutor/tooling/judge';
import { renderReport, renderTranscript } from '@/modules/tutor/tooling/report';
import { findScenario, SCENARIOS } from '@/modules/tutor/tooling/scenarios';
import { HeadlessTutorSession } from '@/modules/tutor/tooling/session';
import { runSimulation, type ExchangeRecord } from '@/modules/tutor/tooling/simulation';
import { SimulatedStudent, type StudentLLM } from '@/modules/tutor/tooling/student';

/** A cheap model from a different provider than the tutor, so the two do not share habits. */
export const DEFAULT_STUDENT_MODEL_ID = 'google/gemini-3.1-flash-lite';

const USAGE = `Usage: bun run tutor:simulate -- [options]

Runs one simulated tutoring session through the app's own store, engine and agent loop,
with an LLM playing the student. Needs OPENROUTER_API_KEY (read from .env.local or .env).

  --scenario <id>          Scenario to play (default linear_equations); --list shows them
  --turns <n>              Exchanges: student message + tutor turn (default: the scenario's)
  --tutor-model <id>       Tutor model (default ${DEFAULT_TUTOR_MODEL_ID})
  --student-model <id>     Student model (default ${DEFAULT_STUDENT_MODEL_ID})
  --plan-editable=<bool>   Study condition flags (default true); false turns the control off
  --model-visible=<bool>
  --model-editable=<bool>
  --learner-edits          Let the student quietly mark topics known or move estimates
  --max-declines <n>       Plan proposals the student may decline (default 1)
  --seed <n>               Seed for the student's answers (default 1)
  --check                  Exit 1 when a protocol health check fails
  --plan-within <n>        Check: plan approved within n exchanges (default ${DEFAULT_CHECK_OPTIONS.planWithin})
  --close-within <n>       Check: a topic ready to complete is closed within n tutor turns (default ${DEFAULT_CHECK_OPTIONS.closeWithin})
  --judge [model]          Also rate the teaching with one LLM call (default: the student model)
  --out <dir>              Where the JSON transcript and report go (default tmp/tutor-sim)
  --env-file <path>        Another env file to read the key from
  --full                   Print replies whole in the report
  --quiet                  No progress lines while running`;

export type CliDeps = {
  /** Replaces the network for the tutor and the student. */
  pipeline?: PipelineClient;
  log?: (line: string) => void;
};

function str(args: ArgMap, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function int(args: ArgMap, key: string, fallback: number): number {
  const parsed = Number.parseInt(str(args, key) ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(args: ArgMap, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (value === true) return true;
  return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
}

function stubModel(id: string): ModelDescriptor {
  return {
    id,
    name: id,
    endpointId: OPENROUTER_ENDPOINT.id,
    context_length: 128000,
    raw: { supported_parameters: ['tools', 'tool_choice', 'reasoning'] },
  };
}

async function describeModels(ids: string[], auth: TransportAuth, offline: boolean) {
  let remote: ModelDescriptor[] = [];
  if (!offline) {
    try {
      remote = await fetchModels(auth);
    } catch {
      remote = [];
    }
  }
  return ids.map((id) => remote.find((m) => m.id === id) ?? stubModel(id));
}

/** A plain completion as the student's (or judge's) voice. */
function completionLLM(
  pipeline: PipelineClient | undefined,
  auth: TransportAuth,
  model: string,
  spend: { cost: number },
): StudentLLM {
  const complete = getChatCompletion(pipeline);
  return async (messages) => {
    const response = await complete({ auth, model, messages, temperature: 0.8, maxTokens: 700 });
    if (typeof response.usage?.cost === 'number') spend.cost += response.usage.cost;
    const content = response.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map((block) => ('text' in block ? String(block.text ?? '') : '')).join('');
  };
}

function tutorChat(tutorModel: string, flags: TutorFlags): Chat {
  const now = Date.now();
  return {
    id: `sim_${uuidv4()}`,
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

function progressLine(x: ExchangeRecord): string {
  const calls = x.tutor.toolCalls.map((c) => `${c.name}${c.ok ? '' : '✗'}`).join(', ');
  const said = x.student.text.replace(/\s+/g, ' ').slice(0, 70);
  return `#${x.index} ${x.student.kind === 'ledger' ? '[' + said + ']' : `"${said}"`} → ${x.tutor.requests.length} round(s)${calls ? `: ${calls}` : ''} · ${x.after.phase}${x.tutor.error ? ` · failed: ${x.tutor.error}` : ''}`;
}

/** Runs the CLI; resolves to the process exit code. */
export async function runTutorSimulationCli(argv: string[], deps: CliDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const args = parseArgs(argv);
  if (args.help) {
    log(USAGE);
    return 0;
  }
  if (args.list) {
    for (const s of SCENARIOS) {
      log(
        `${s.id}: ${s.title}\n  ${s.persona}\n  Weak on: ${s.gaps.map((g) => g.topic).join(', ')}`,
      );
    }
    return 0;
  }

  const scenarioId = str(args, 'scenario') ?? 'linear_equations';
  const scenario = findScenario(scenarioId);
  if (!scenario) {
    throw new Error(
      `Unknown scenario "${scenarioId}". Try: ${SCENARIOS.map((s) => s.id).join(', ')}`,
    );
  }

  // A scripted pipeline needs no key, and a test should not read one into the environment.
  let key = 'offline';
  if (!deps.pipeline) {
    const envFile = str(args, 'env-file');
    await loadEnvDefaults(['.env.local', '.env', ...(envFile ? [path.resolve(envFile)] : [])]);
    const found = getOpenRouterKeyFallback();
    if (!found) {
      throw new Error(
        'No OPENROUTER_API_KEY in the environment, .env.local or .env (see --env-file).',
      );
    }
    key = found;
  }
  const auth = buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: key });

  const tutorModel = str(args, 'tutor-model') ?? DEFAULT_TUTOR_MODEL_ID;
  const studentModel = str(args, 'student-model') ?? DEFAULT_STUDENT_MODEL_ID;
  const judgeModel = args.judge ? (str(args, 'judge') ?? studentModel) : undefined;
  const flags = resolveTutorFlags({
    planEditable: bool(args, 'plan-editable'),
    learnerModelVisible: bool(args, 'model-visible'),
    learnerModelEditable: bool(args, 'model-editable'),
  });
  const seed = int(args, 'seed', 1);
  const exchanges = Math.max(1, int(args, 'turns', scenario.exchanges));

  const models = await describeModels([tutorModel], auth, !!deps.pipeline);
  const spend = { cost: 0 };
  const session = new HeadlessTutorSession({
    chat: tutorChat(tutorModel, flags),
    models,
    resolveAuth: () => auth,
    ...(deps.pipeline ? { pipeline: deps.pipeline } : {}),
  });
  const student = new SimulatedStudent({
    scenario,
    llm: completionLLM(deps.pipeline, auth, studentModel, spend),
    seed,
  });

  log(
    `Simulating ${scenario.id}: ${exchanges} exchanges, tutor ${tutorModel}, student ${studentModel}`,
  );
  const run = await runSimulation({
    session,
    student,
    exchanges,
    flags,
    learnerEdits: !!args['learner-edits'],
    maxDeclines: int(args, 'max-declines', 1),
    meta: { tutorModel, studentModel, seed },
    ...(args.quiet ? {} : { onExchange: (x: ExchangeRecord) => log(progressLine(x)) }),
  });

  const checks = checkRun(run, {
    planWithin: int(args, 'plan-within', DEFAULT_CHECK_OPTIONS.planWithin),
    closeWithin: int(args, 'close-within', DEFAULT_CHECK_OPTIONS.closeWithin),
  });
  let judgement: Judgement | undefined;
  if (judgeModel) {
    judgement = await judgeSession(
      completionLLM(deps.pipeline, auth, judgeModel, spend),
      scenario,
      renderTranscript(run),
    );
  }

  const report = renderReport(run, {
    full: !!args.full,
    checks,
    ...(judgement ? { judgement } : {}),
  });
  const outDir = path.resolve(str(args, 'out') ?? path.join('tmp', 'tutor-sim'));
  const stamp = run.meta.startedAt.replace(/[:.]/g, '-');
  const base = path.join(outDir, `${scenario.id}-${stamp}`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    `${base}.json`,
    JSON.stringify(
      { ...run, studentCost: spend.cost, checks, ...(judgement ? { judgement } : {}) },
      null,
      2,
    ),
  );
  await fs.writeFile(`${base}.txt`, `${report}\n`);

  log('');
  log(report);
  log('');
  log(`Wrote ${base}.json and ${base}.txt`);
  const failed = checks.filter((c) => !c.ok);
  return args.check && failed.length ? 1 : 0;
}
