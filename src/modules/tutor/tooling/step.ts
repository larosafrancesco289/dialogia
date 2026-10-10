#!/usr/bin/env tsx
// `bun run tutor:step`: one learner move in a saved tutor chat. See USAGE.

import { parseArgs } from '@/lib/cli/args';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { SIM_PROVIDERS, type SimProvider } from '@/modules/tutor/tooling/providers';
import { StepRun } from '@/modules/tutor/tooling/stepwise';

const USAGE = `Usage: bun run tutor:step -- <move> --run <folder> [arguments]

Plays a tutor chat one learner move at a time. The tutor runs through the app's own
pipeline on a real model; the chat is saved in the folder between moves.

Start:
  new --run <folder> [--provider anthropic|openrouter] [--tutor-model <id>]
      [--lang en|it|fr|es|de|pt-BR|el] [--persona <id>]
      [--plan-editable=false] [--model-visible=false] [--model-editable=false]

Moves (each prints what the learner sees next):
  say "<message>"              Type a message
  answer B A C                 Answer the open quiz or diagnostic, one letter per question
  intake 1:A 2:B,C             Answer the open intake card
  approve | decline "<why>"    Answer a plan proposal
  go-on | more-practice        Choose at a chapter break
  known <topic#>               "I know this" in the Learning Hub
  reopen <topic#>              Reopen a finished topic
  too-high <topic#>            "Too high" on an estimate
  too-low <topic#>             "Too low" on an estimate
  cleared <topic#> <idea#>     "I've got this now" on an open idea (misconception)
  view                         Show the screen again without moving

End:
  finish                       Write transcript.json and report.txt with the protocol checks

The key comes from ANTHROPIC_API_KEY or OPENROUTER_API_KEY (environment, .env.local,
.env or --env-file); ANTHROPIC_WORKSPACE_ID is sent when set.`;

function positional(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      if (!token.includes('=') && argv[i + 1] && !argv[i + 1].startsWith('--')) i += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

const flag = (value: string | boolean | undefined) =>
  value === undefined ? undefined : !['false', '0', 'no', 'off'].includes(String(value));

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const [move, ...rest] = positional(argv);
  if (args.help || !move) {
    console.log(USAGE);
    return move ? 0 : 1;
  }
  const dir = typeof args.run === 'string' ? args.run : undefined;
  if (!dir) throw new Error('Every move needs --run <folder>.');
  const envFile = typeof args['env-file'] === 'string' ? args['env-file'] : undefined;
  const deps = envFile ? { envFile } : {};

  if (move === 'new') {
    const provider = (
      typeof args.provider === 'string' ? args.provider : 'anthropic'
    ) as SimProvider;
    if (!SIM_PROVIDERS.includes(provider)) throw new Error(`Unknown --provider "${provider}".`);
    const run = await StepRun.create(
      dir,
      {
        provider,
        tutorModel:
          typeof args['tutor-model'] === 'string' ? args['tutor-model'] : DEFAULT_TUTOR_MODEL_ID,
        flags: {
          planEditable: flag(args['plan-editable']),
          learnerModelVisible: flag(args['model-visible']),
          learnerModelEditable: flag(args['model-editable']),
        },
        ...(typeof args.lang === 'string' ? { lang: args.lang } : {}),
        ...(typeof args.persona === 'string' ? { persona: args.persona } : {}),
      },
      deps,
    );
    console.log(run.screen());
    return 0;
  }

  const run = await StepRun.open(dir, deps);
  switch (move) {
    case 'say':
      console.log(await run.say(rest.join(' ')));
      return 0;
    case 'answer':
      console.log(await run.answer(rest.flatMap((part) => part.split(/[\s,]+/)).filter(Boolean)));
      return 0;
    case 'intake':
      console.log(await run.intake(rest));
      return 0;
    case 'approve':
      console.log(await run.approve());
      return 0;
    case 'decline':
      console.log(await run.decline(rest.join(' ')));
      return 0;
    case 'go-on':
      console.log(await run.goOn());
      return 0;
    case 'more-practice':
      console.log(await run.morePractice());
      return 0;
    case 'known':
    case 'reopen':
    case 'too-high':
    case 'too-low':
    case 'cleared':
      console.log(await run.hub(move, rest[0] ?? '', rest[1]));
      return 0;
    case 'view':
      console.log(run.screen());
      return 0;
    case 'finish': {
      const { checks } = await run.finish();
      const failed = checks.filter((c) => !c.ok);
      for (const check of checks) {
        console.log(
          `${check.ok ? (check.skipped ? '–' : '✓') : '✗'} ${check.id}: ${check.summary}`,
        );
      }
      console.log(
        `\nTutor spend $${run.meta.cost.toFixed(4)}. Wrote ${dir}/transcript.json and ${dir}/report.txt.`,
      );
      return failed.length ? 1 : 0;
    }
    default:
      throw new Error(`Unknown move "${move}". Run with --help for the list.`);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
