// Module: tutor engine tools
// Responsibility: which tutor tools exist in a state, their JSON-schema definitions, argument parsing into commands, and compact results.

import type { ToolDefinition } from '@/lib/transport/contracts';
import { gateTutorTool, type TutorToolName } from '@/modules/tutor/engine/commands';
import type { TutorFlags } from '@/modules/tutor/engine/flags';
import type { TutorState } from '@/modules/tutor/engine/state';
import { TUTOR_TOOLS, TUTOR_TOOL_NAMES } from '@/modules/tutor/engine/tools/definitions';

export {
  TOOL_ENDS_TURN,
  TUTOR_TOOLS,
  TUTOR_TOOL_NAMES,
} from '@/modules/tutor/engine/tools/definitions';
export * from '@/modules/tutor/engine/tools/parse';
export * from '@/modules/tutor/engine/tools/results';

/** Exactly the tools `decide` would not refuse on phase, open card, flags or budget. */
export function availableTutorTools(state: TutorState, flags: TutorFlags): TutorToolName[] {
  return TUTOR_TOOL_NAMES.filter((name) => gateTutorTool(state, flags, name) === null);
}

export function tutorToolDefinitions(state: TutorState, flags: TutorFlags): ToolDefinition[] {
  return availableTutorTools(state, flags).map((name) => TUTOR_TOOLS[name]);
}
