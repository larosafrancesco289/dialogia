#!/usr/bin/env tsx
import { runTutorSimulationCli } from '@/modules/tutor/tooling/cli';

runTutorSimulationCli(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error('Tutor simulation failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
