// Module: tools/registry
// Responsibility: Open registry of model-callable tools. Core owns the container and
// the kind vocabulary; feature modules own their own tools and metadata.
// This file must not import from any feature module.

import type { PlanningToolExecutionResult, ToolExecutionArgs } from '@/lib/tools/execution';
import type { ToolCallCategory } from '@/lib/types/enums';
import type { ToolDefinition } from '@/lib/transport/contracts';

export type ToolKind =
  // ordinary tool; any number may run per round
  | 'action'
  // at most one runs per round
  | 'content'
  // always scheduled first
  | 'meta';

export type ToolMetadata = {
  /** Owning module id: 'core', 'tutor', future module ids. */
  module: string;
  kind: ToolKind;
  /** Label the tool-call ledger shows this tool under. Defaults to 'other'. */
  logCategory?: ToolCallCategory;
  /** Module-private metadata. Only the owning module may interpret it. */
  ext?: Record<string, unknown>;
};

export type PlanningToolHandler = (args: ToolExecutionArgs) => Promise<PlanningToolExecutionResult>;

export type ToolRegistryEntry = {
  definition: ToolDefinition;
  metadata: ToolMetadata;
  handler?: PlanningToolHandler;
};

export type ToolFilter = { module?: string; kind?: ToolKind };

const REGISTRY = new Map<string, ToolRegistryEntry>();

/** Idempotent: re-registering a name replaces the entry. */
export function registerTool(name: string, entry: ToolRegistryEntry): void {
  REGISTRY.set(name, entry);
}

export function unregisterTool(name: string): void {
  REGISTRY.delete(name);
}

export function getTool(name: string): ToolRegistryEntry | undefined {
  return REGISTRY.get(name);
}

export function isRegisteredTool(name: string): boolean {
  return REGISTRY.has(name);
}

const matches = (entry: ToolRegistryEntry, filter?: ToolFilter): boolean => {
  if (!filter) return true;
  if (filter.module && entry.metadata.module !== filter.module) return false;
  if (filter.kind && entry.metadata.kind !== filter.kind) return false;
  return true;
};

export function listTools(filter?: ToolFilter): string[] {
  const names: string[] = [];
  REGISTRY.forEach((entry, name) => {
    if (matches(entry, filter)) names.push(name);
  });
  return names;
}

export function getToolDefinitions(filter?: ToolFilter): ToolDefinition[] {
  const definitions: ToolDefinition[] = [];
  REGISTRY.forEach((entry) => {
    if (matches(entry, filter)) definitions.push(entry.definition);
  });
  return definitions;
}

export function getToolHandler(name: string): PlanningToolHandler | undefined {
  return REGISTRY.get(name)?.handler;
}

export function getToolKind(name: string): ToolKind | undefined {
  return REGISTRY.get(name)?.metadata.kind;
}

export function getToolModule(name: string): string | undefined {
  return REGISTRY.get(name)?.metadata.module;
}

export function getToolLogCategory(name: string): ToolCallCategory {
  return REGISTRY.get(name)?.metadata.logCategory ?? 'other';
}

export function isContentTool(name: string): boolean {
  return getToolKind(name) === 'content';
}

export function isMetaTool(name: string): boolean {
  return getToolKind(name) === 'meta';
}

/** Reads a module-private metadata key. Callers must own the module that wrote it. */
export function getToolExt(name: string, key: string): unknown {
  return REGISTRY.get(name)?.metadata.ext?.[key];
}
