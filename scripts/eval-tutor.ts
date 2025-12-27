#!/usr/bin/env tsx
import { defaultTutorScenarios, type TutorScenario } from '@/lib/eval/tutorScenarios';
import { runTutorScenario } from '@/lib/eval/tutorDriver';
import { parseArgs } from '@/lib/cli/args';
import { loadEnvDefaults } from '@/lib/cli/env.node';

function usage() {
  console.log(
    [
      'Usage: bun run scripts/eval-tutor.ts [--scenario <id>] [--out <dir>]',
      '',
      'Options:',
      '  --scenario <id>   Run a single scenario (default: run all defaults)',
      '  --out <dir>       Output directory (default: tmp/tutor_evals)',
      '  --list            List available scenario ids',
    ].join('\n'),
  );
}

function pickScenarios(targetId: string | undefined): TutorScenario[] {
  if (!targetId) return defaultTutorScenarios;
  const chosen = defaultTutorScenarios.find((s) => s.id === targetId);
  if (!chosen) {
    throw new Error(`Unknown scenario "${targetId}". Use --list to see options.`);
  }
  return [chosen];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (args.list) {
    defaultTutorScenarios.forEach((scenario) => {
      console.log(`${scenario.id} - ${scenario.title} (${scenario.topic}, ${scenario.level})`);
    });
    return;
  }

  await loadEnvDefaults();

  const scenarios = pickScenarios(typeof args.scenario === 'string' ? args.scenario : undefined);
  const outputDir =
    typeof args.out === 'string' && args.out.trim().length > 0
      ? args.out.trim()
      : 'tmp/tutor_evals';

  const apiKeys = {
    openrouter:
      process.env.OPENROUTER_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTER_API_KEY ||
      process.env.OPENROUTER_KEY,
    anthropic:
      process.env.ANTHROPIC_API_KEY ||
      process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_KEY,
  };

  for (const scenario of scenarios) {
    console.log(`\nRunning scenario ${scenario.id}: ${scenario.title}`);
    const result = await runTutorScenario(scenario, {
      apiKeys,
      outputDir,
    });
    const verdict = result.judge.parsed;
    if (verdict) {
      const topStrengths = Array.isArray(verdict.strengths)
        ? verdict.strengths.slice(0, 2).join('; ')
        : '';
      console.log(
        `  Score: ${verdict.overall_score?.toFixed(2) ?? 'n/a'} - strengths: ${topStrengths}`,
      );
    } else {
      console.log('  Judge response not parsed; see raw output for details.');
    }
    if (result.outputPath) {
      console.log(`  Saved: ${result.outputPath}`);
    }
  }
}

main().catch((error) => {
  console.error('Tutor eval failed:', error);
  process.exit(1);
});
