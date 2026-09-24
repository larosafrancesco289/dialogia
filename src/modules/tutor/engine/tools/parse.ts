// Module: tutor engine tool parsing
// Responsibility: a tool call's name and raw arguments into a tutor command, or a structured error the model can act on.

import type { z } from 'zod';
import type { TutorError, TutorToolCommand, TutorToolName } from '@/modules/tutor/engine/commands';
import { ARGS, TUTOR_TOOL_NAMES } from '@/modules/tutor/engine/tools/definitions';
import { loosen, relax, retire } from '@/modules/tutor/engine/tools/leniency';

export type ParsedToolCall =
  | {
      ok: true;
      command: TutorToolCommand;
      /** What parsing ignored or corrected, in words the model can read; absent when nothing. */
      adjusted?: string[];
    }
  | { ok: false; error: TutorError };

function isToolName(name: string): name is TutorToolName {
  return (TUTOR_TOOL_NAMES as readonly string[]).includes(name);
}

/** Tool-call arguments (object or JSON string) into a command, or a structured error. */
export function parseTutorToolCall(name: string, rawArgs: unknown): ParsedToolCall {
  if (!isToolName(name)) {
    return {
      ok: false,
      error: {
        code: 'unknown_tool',
        message: `There is no tutor tool "${name}".`,
        hint: `Tutor tools: ${TUTOR_TOOL_NAMES.join(', ')}.`,
      },
    };
  }
  let input = rawArgs ?? {};
  if (typeof input === 'string') {
    try {
      input = input.trim() ? JSON.parse(input) : {};
    } catch {
      return {
        ok: false,
        error: {
          code: 'invalid_arguments',
          message: 'The arguments are not valid JSON.',
          hint: `Call ${name} again with a JSON object.`,
        },
      };
    }
  }
  const adjusted: string[] = [];
  const loosened = relax(name, loosen(ARGS[name], retire(name, input), [], adjusted), adjusted);
  const parsed = ARGS[name].safeParse(loosened);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5);
    const where = (path: (string | number)[]) => (path.length ? path.join('.') : 'arguments');
    const fields = [...new Set(issues.map((issue) => where(issue.path)))];
    return {
      ok: false,
      error: {
        code: 'invalid_arguments',
        message: issues.map((issue) => `${where(issue.path)}: ${issue.message}`).join('; '),
        hint: `Change ${fields.join(', ')} as the message says and call ${name} again. Leave out any optional field you have no value for.`,
      },
    };
  }
  const command = toCommand(name, parsed.data);
  return adjusted.length ? { ok: true, command, adjusted } : { ok: true, command };
}

function toCommand(name: TutorToolName, data: unknown): TutorToolCommand {
  switch (name) {
    case 'ask_intake':
      return { by: 'tutor', type: name, ...(data as z.infer<(typeof ARGS)['ask_intake']>) };
    case 'give_diagnostic': {
      const args = data as z.infer<(typeof ARGS)['give_diagnostic']>;
      return {
        by: 'tutor',
        type: name,
        topic: args.topic,
        items: args.items.map(({ topicId: nodeId, ...item }) => ({ ...item, nodeId })),
      };
    }
    case 'propose_plan': {
      const args = data as z.infer<(typeof ARGS)['propose_plan']>;
      return {
        by: 'tutor',
        type: name,
        goal: args.goal,
        rationale: args.rationale,
        nodes: args.topics,
      };
    }
    case 'give_quiz':
      return { by: 'tutor', type: name, ...(data as z.infer<(typeof ARGS)['give_quiz']>) };
    case 'record_evidence': {
      const { topicId: nodeId, ...args } = data as z.infer<(typeof ARGS)['record_evidence']>;
      return { by: 'tutor', type: name, nodeId, ...args };
    }
    case 'note_misconception': {
      const { topicId: nodeId, ...args } = data as z.infer<(typeof ARGS)['note_misconception']>;
      return { by: 'tutor', type: name, nodeId, ...args };
    }
    case 'resolve_misconception': {
      const { topicId: nodeId, ...args } = data as z.infer<(typeof ARGS)['resolve_misconception']>;
      return { by: 'tutor', type: name, nodeId, ...args };
    }
    case 'complete_topic': {
      const { topicId: nodeId, ...args } = data as z.infer<(typeof ARGS)['complete_topic']>;
      return { by: 'tutor', type: name, nodeId, ...args };
    }
    case 'start_topic': {
      const args = data as z.infer<(typeof ARGS)['start_topic']>;
      return { by: 'tutor', type: name, nodeId: args.topicId };
    }
  }
}
