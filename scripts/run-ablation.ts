#!/usr/bin/env tsx
import { runAblationCli } from '@/lib/eval/ablationRunner';

runAblationCli(process.argv.slice(2)).catch((error) => {
  console.error('Ablation study failed:', error);
  process.exit(1);
});
