#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '@/lib/cli/args';
import { loadEnvDefaults } from '@/lib/cli/env.node';
import { getOpenRouterKeyFallback } from '@/lib/env/keys';
import { resolveModelTransport } from '@/lib/providers';
import { createHeadlessRunner } from '@/tooling/headless/runner';
import { createModelIndex } from '@/lib/models';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type { Chat, ModelDescriptor, ModelTransport } from '@/lib/types';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { createOpenRouterAccess } from '@/lib/openrouter/pipeline';

type StepStatus = 'pass' | 'fail';

type StepResult = {
  name: string;
  status: StepStatus;
  durationMs: number;
  detail?: string;
};

type SmokeReport = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: StepResult[];
  live?: {
    enabled: boolean;
    modelId?: string;
    transport?: ModelTransport;
    assistantLength?: number;
    error?: string;
  };
};

function runCommand(name: string, command: string, args: string[]): StepResult {
  const start = Date.now();
  const child = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  const durationMs = Date.now() - start;
  const status: StepStatus = child.status === 0 ? 'pass' : 'fail';
  const detail = child.status === 0 ? undefined : `Exit code ${child.status ?? 'unknown'}`;
  return { name, status, durationMs, detail };
}

function createStubModel(
  id: string,
  transport: ModelTransport,
  supportsTools: boolean,
): ModelDescriptor {
  const supported: string[] = supportsTools ? ['tools', 'reasoning'] : ['reasoning'];
  return {
    id,
    name: id,
    context_length: 16000,
    transport,
    raw: { supported_parameters: supported },
  };
}

function resolveAuthFactory(apiKey: string) {
  return ({ transport }: { modelId: string; transport: ModelTransport }): TransportAuth => {
    if (transport === 'openrouter') {
      return createOpenRouterAccess({
        apiKey,
        tier: 'developer',
        useProxy: false,
      }).auth;
    }
    return buildTransportAuth({ transport, apiKey, useProxy: false });
  };
}

async function runLiveTurn(modelId: string): Promise<{
  success: boolean;
  transport: ModelTransport;
  assistantLength?: number;
  error?: string;
}> {
  await loadEnvDefaults();
  const openrouterKey = getOpenRouterKeyFallback();
  if (!openrouterKey) {
    return {
      success: false,
      transport: 'openrouter',
      error: 'OPENROUTER_API_KEY not found in environment.',
    };
  }

  const transport = resolveModelTransport(modelId) || 'openrouter';
  const model = createStubModel(modelId, transport, true);
  const chat: Chat = {
    id: 'study-smoke-live-chat',
    title: 'Study Smoke Live Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      system: DEFAULT_BASE_SYSTEM,
      modelId,
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
          defaultModelId: modelId,
          enableLearnerModel: true,
        },
      },
    },
  };

  const runner = createHeadlessRunner({
    chat,
    models: [model],
    modelIndex: createModelIndex([model]),
    resolveAuth: resolveAuthFactory(openrouterKey),
    uiOverrides: {
      debug: { mode: false },
      flags: { experimentalTutor: true },
      tutor: { forceMode: true },
      overrides: { tutorMode: true },
    },
  });

  try {
    const snapshot = await runner.runTurn({
      turnIndex: 0,
      content: 'Teach me one key idea about derivatives in 2 short sentences.',
    });
    const assistantLength = snapshot.assistant.content.trim().length;
    if (!assistantLength) {
      return {
        success: false,
        transport,
        assistantLength,
        error: 'Assistant response was empty.',
      };
    }
    return { success: true, transport, assistantLength };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown live turn failure';
    return { success: false, transport, error: message };
  }
}

async function writeReport(report: SmokeReport): Promise<string> {
  const outputDir = path.resolve(process.cwd(), 'tmp/study-smoke');
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'report.json');
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  return outputPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const liveEnabled = !!args.live;
  const liveModelId =
    typeof args['live-model'] === 'string' ? args['live-model'] : DEFAULT_TUTOR_MODEL_ID;

  const startedAt = Date.now();
  const steps: StepResult[] = [];

  console.log('\n=== Study Smoke ===');
  console.log('1) Running test suite');
  steps.push(runCommand('tests', 'bun', ['run', 'test']));

  console.log('\n2) Running production build');
  steps.push(runCommand('build', 'bun', ['run', 'build']));

  const deterministicFailed = steps.some((step) => step.status === 'fail');
  let liveResult:
    | {
        enabled: boolean;
        modelId?: string;
        transport?: ModelTransport;
        assistantLength?: number;
        error?: string;
      }
    | undefined;

  if (!deterministicFailed && liveEnabled) {
    console.log('\n3) Running optional live headless turn');
    const live = await runLiveTurn(liveModelId);
    liveResult = {
      enabled: true,
      modelId: liveModelId,
      transport: live.transport,
      assistantLength: live.assistantLength,
      error: live.error,
    };
    steps.push({
      name: 'live_turn',
      status: live.success ? 'pass' : 'fail',
      durationMs: 0,
      detail: live.success
        ? `Model ${liveModelId} returned ${live.assistantLength ?? 0} chars`
        : live.error,
    });
  } else if (liveEnabled) {
    liveResult = {
      enabled: true,
      modelId: liveModelId,
      error: 'Skipped live turn because deterministic checks failed.',
    };
  } else {
    liveResult = { enabled: false };
  }

  const finishedAt = Date.now();
  const report: SmokeReport = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    steps,
    live: liveResult,
  };

  const reportPath = await writeReport(report);
  const passed = steps.every((step) => step.status === 'pass');

  console.log('\n=== Checklist ===');
  for (const step of steps) {
    const badge = step.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`${badge} ${step.name} (${step.durationMs}ms)${step.detail ? ` - ${step.detail}` : ''}`);
  }
  console.log(`Report: ${reportPath}`);

  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Study smoke failed';
  console.error(message);
  process.exitCode = 1;
});
