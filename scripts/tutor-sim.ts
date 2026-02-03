#!/usr/bin/env tsx
import { runTutorSimulationCli } from '@/tooling/headless/tutorSimulation';

runTutorSimulationCli(process.argv.slice(2)).catch((error) => {
  console.error('Tutor simulation failed:', error);
  process.exit(1);
});
