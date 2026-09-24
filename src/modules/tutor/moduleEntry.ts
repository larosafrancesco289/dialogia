// Module: modules/tutor/moduleEntry
// Responsibility: The tutor module's turn-time surface. Loaded with the turn
// pipeline, never at boot, so none of this reaches the first-load bundle.

import type { ModuleRuntime } from '@/lib/modules';
import { buildTutorComposeContribution } from '@/modules/tutor/agent/compose';
import { registerTutorTools } from '@/modules/tutor/tools/register';

export const tutorRuntime: ModuleRuntime = {
  registerTools: registerTutorTools,
  compose: buildTutorComposeContribution,
};
