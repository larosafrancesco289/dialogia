// Module: tutor tools register
// Responsibility: the engine's tools in the core registry. Every handler parses the call
// into a command and dispatches it; the engine decides, and the model reads a compact result.

import {
  TOOL_ENDS_TURN,
  TUTOR_TOOLS,
  TUTOR_TOOL_NAMES,
  parseTutorToolCall,
  tutorToolError,
  tutorToolResult,
  withAdjustments,
  type TutorError,
  type TutorToolName,
} from '@/modules/tutor/engine';
import { tutorStore } from '@/modules/tutor/store/access';
import { registerTool, type PlanningToolHandler } from '@/lib/tools/registry';
import type { ToolResult } from '@/lib/tools/execution';

export const TUTOR_MODULE_ID = 'tutor';

/**
 * What a later turn replays of this call's arguments: the call as made, minus
 * answer keys and the explanations that give them away.
 */
function replayArguments(raw: string | undefined): Record<string, unknown> | undefined {
  let args: unknown;
  try {
    args = raw && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return undefined;
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined;
  const record = args as Record<string, unknown>;
  if (!Array.isArray(record.items)) return record;
  return {
    ...record,
    items: record.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const {
        correct: _correct,
        explanation: _explanation,
        ...rest
      } = item as Record<string, unknown>;
      return rest;
    }),
  };
}

function createHandler(name: TutorToolName): PlanningToolHandler {
  const endsTurn = TOOL_ENDS_TURN[name];
  return async ({ toolCall, parsedArgs, roundMeta, context, aggregatedResults }) => {
    const log = context.logger.start({
      name,
      input: parsedArgs,
      category: 'tutor',
      metadata: roundMeta,
    });
    const replay = { arguments: replayArguments(toolCall.function.arguments) };

    const refuse = (error: TutorError) => {
      const result = tutorToolError(error) as ToolResult;
      log.error(result, error.message, roundMeta ? { ...roundMeta } : undefined);
      return { aggregatedResults, usedTool: false, usedContentTool: false, result, replay };
    };

    const parsed = parseTutorToolCall(name, toolCall.function.arguments);
    if (!parsed.ok) return refuse(parsed.error);

    const store = tutorStore(context.get);
    if (!store) {
      return refuse({
        code: 'unknown_tool',
        message: 'The tutor is not available in this chat.',
        hint: 'Carry on without tutor tools.',
      });
    }

    // `decide` checks the gate (phase, open card, flags, budgets) against the
    // state this call is serialized behind, so a stale view cannot slip through.
    const outcome = await store.dispatchTutor(context.chatId, parsed.command, {
      by: 'tutor',
      messageId: context.assistantMessage.id,
    });
    if (!outcome.ok) return refuse(outcome.error);

    const result = withAdjustments(
      tutorToolResult(name, outcome.before, outcome.state, outcome.events),
      parsed.adjusted,
    ) as ToolResult;
    log.success(result, roundMeta ? { ...roundMeta } : undefined);
    return {
      aggregatedResults,
      usedTool: true,
      usedContentTool: endsTurn,
      result,
      endsTurn,
      replay,
    };
  };
}

let registered = false;

/**
 * Cards (a tool that ends the turn) are `content`: at most one per round, and
 * run after the round's state tools, so "start the topic, then quiz it" works
 * in one round. State tools are `action`: any number per round, in the order
 * the model called them. Every round is replayed on later turns.
 */
export function registerTutorTools(): void {
  if (registered) return;
  registered = true;
  for (const name of TUTOR_TOOL_NAMES) {
    registerTool(name, {
      definition: TUTOR_TOOLS[name],
      metadata: {
        module: TUTOR_MODULE_ID,
        kind: TOOL_ENDS_TURN[name] ? 'content' : 'action',
        logCategory: 'tutor',
        replay: true,
      },
      handler: createHandler(name),
    });
  }
}
