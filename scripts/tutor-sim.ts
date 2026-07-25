#!/usr/bin/env tsx
import { runTutorSimulationCli } from '@/modules/tutor/tooling/tutorSimulation';

runTutorSimulationCli(process.argv.slice(2)).catch((error) => {
  console.error('Tutor simulation failed:', error);
  process.exit(1);
});
