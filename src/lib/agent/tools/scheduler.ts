// Module: agent/tools/scheduler
// Responsibility: Order and cap the tool calls a model asked for in one round.
// Core duties only: search dedupe and per-round cap, meta-first, one content tool
// per round. Which content tool wins is delegated to the owning module.

import type { ToolCall } from '@/lib/agent/types';
import { isContentTool, isMetaTool, isSearchTool } from '@/lib/tools';

export type ScheduleInput = {
  allowSearch?: boolean;
  alreadyUsedContent?: boolean;
  /** Supplied by the active module; ranks competing content tools. Identity by default. */
  contentPriority?: (candidates: string[]) => string[];
};

// Models split questions into parallel sub-query searches; allow a few per
// round so dropped calls don't strand pre-logged UI entries or force re-asks.
const MAX_SEARCH_CALLS_PER_ROUND = 3;

function pickContentTool(candidates: ToolCall[], input: ScheduleInput): ToolCall | undefined {
  if (input.alreadyUsedContent || candidates.length === 0) return undefined;

  const firstByName = new Map<string, ToolCall>();
  candidates.forEach((call) => {
    const name = call.function?.name ?? '';
    if (!name) return;
    if (!firstByName.has(name)) firstByName.set(name, call);
  });

  const ranked = input.contentPriority?.([...firstByName.keys()]);
  if (ranked) {
    for (const name of ranked) {
      const hit = firstByName.get(name);
      if (hit) return hit;
    }
  }

  return candidates[0];
}

export function schedulePlanningToolCalls(
  toolCalls: ToolCall[],
  input: ScheduleInput = {},
): ToolCall[] {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
  const meta: ToolCall[] = [];
  const contentCandidates: ToolCall[] = [];
  const others: ToolCall[] = [];
  const searches: ToolCall[] = [];
  const seenSearchArgs = new Set<string>();

  toolCalls.forEach((call) => {
    const name = call.function?.name ?? '';
    if (!name) return;
    if (isMetaTool(name)) {
      meta.push(call);
      return;
    }
    if (isContentTool(name)) {
      if (!input.alreadyUsedContent) contentCandidates.push(call);
      return;
    }
    if (isSearchTool(name)) {
      if (input.allowSearch === false) return;
      if (searches.length >= MAX_SEARCH_CALLS_PER_ROUND) return;
      const signature = `${name}:${call.function?.arguments ?? ''}`;
      if (seenSearchArgs.has(signature)) return;
      seenSearchArgs.add(signature);
      searches.push(call);
      return;
    }
    others.push(call);
  });

  const content = pickContentTool(contentCandidates, input);
  const ordered: ToolCall[] = [];
  ordered.push(...meta);
  ordered.push(...searches);
  if (content) ordered.push(content);
  if (others.length > 0) ordered.push(...others);
  return ordered;
}
