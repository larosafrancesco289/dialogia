import type { StudyActionType, StudyLogEntry, StudySession } from './types';
import { getCondition, getStudySession } from './storage';

export type SessionSummary = {
  participantId: string;
  condition: 'A' | 'B';
  entryCount: number;
  startedAt: number;
  isEnded: boolean;
};

export type StudyLogCopyScope = 'current_condition' | 'full_session';

export type InspectorMetadata = Record<string, string | number | boolean | null>;

export type StudySummaryRecentEvent = {
  timestamp: number;
  action: StudyActionType;
  metadata?: InspectorMetadata;
};

export type StudySummary = {
  totalEntries: number;
  entriesByAction: Partial<Record<StudyActionType, number>>;
  recentEvents: StudySummaryRecentEvent[];
  investigation: {
    inspectedNodeCount: number;
    deepNodeCount: number;
    averageDwellMs: number;
    totalNodeInteractions: number;
  };
};

export type StudyExportPayload = {
  schemaVersion: 2;
  session: StudySession;
  summary: StudySummary;
};

export type StudyInspectorSnapshot = StudySummary & {
  condition: 'A' | 'B';
};

function filterSessionByScope(
  session: StudySession,
  scope: StudyLogCopyScope,
  currentCondition?: 'A' | 'B' | null,
): StudySession {
  if (scope === 'full_session') return session;

  const targetCondition = currentCondition ?? session.condition;
  return {
    ...session,
    condition: targetCondition,
    entries: session.entries.filter((entry) => entry.condition === targetCondition),
  };
}

function compactMetadata(
  metadata: StudyLogEntry['metadata'] | undefined,
): InspectorMetadata | undefined {
  if (!metadata) return undefined;
  const compact: InspectorMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      compact[key] = value;
      continue;
    }
    if (value === undefined) continue;
    compact[key] = '[complex]';
  }
  return Object.keys(compact).length ? compact : undefined;
}

export function buildStudySummary(
  session: StudySession,
  options?: { recentLimit?: number },
): StudySummary {
  const recentLimit = options?.recentLimit ?? 10;
  const entriesByAction: Partial<Record<StudyActionType, number>> = {};
  const recentEvents: StudySummaryRecentEvent[] = [];
  let inspectedNodeCount = 0;
  let deepNodeCount = 0;
  let dwellAccumulator = 0;
  let dwellCount = 0;
  let totalNodeInteractions = 0;

  for (const entry of session.entries) {
    entriesByAction[entry.action] = (entriesByAction[entry.action] ?? 0) + 1;

    if (entry.action === 'plan_node_inspected') {
      inspectedNodeCount += 1;
      const depth = entry.metadata?.depth;
      const dwellMs = entry.metadata?.dwellMs;
      const interactionCount = entry.metadata?.interactionCount;
      if (depth === 'deep') deepNodeCount += 1;
      if (typeof dwellMs === 'number') {
        dwellAccumulator += dwellMs;
        dwellCount += 1;
      }
      if (typeof interactionCount === 'number') {
        totalNodeInteractions += interactionCount;
      }
    }

    recentEvents.push({
      timestamp: entry.timestamp,
      action: entry.action,
      metadata: compactMetadata(entry.metadata),
    });
  }

  const averageDwellMs = dwellCount > 0 ? Math.round(dwellAccumulator / dwellCount) : 0;

  return {
    totalEntries: session.entries.length,
    entriesByAction,
    recentEvents: recentEvents.slice(-recentLimit),
    investigation: {
      inspectedNodeCount,
      deepNodeCount,
      averageDwellMs,
      totalNodeInteractions,
    },
  };
}

export function buildStudyExportPayload(
  session: StudySession,
  scope: StudyLogCopyScope,
  currentCondition?: 'A' | 'B' | null,
): StudyExportPayload {
  const scopedSession = filterSessionByScope(session, scope, currentCondition);
  return {
    schemaVersion: 2,
    session: scopedSession,
    summary: buildStudySummary(scopedSession),
  };
}

export async function copyStudyLogToClipboard(options?: {
  scope?: StudyLogCopyScope;
}): Promise<{ success: boolean; error?: string }> {
  const session = getStudySession();
  if (!session) return { success: false, error: 'No active session' };
  const scope = options?.scope ?? 'current_condition';
  const payload = buildStudyExportPayload(session, scope, getCondition());

  const json = JSON.stringify(payload, null, 2);

  try {
    await navigator.clipboard.writeText(json);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Clipboard access denied';
    return { success: false, error: message };
  }
}

export function getStudyInspectorSnapshot(options?: {
  scope?: StudyLogCopyScope;
  recentLimit?: number;
}): StudyInspectorSnapshot | null {
  const session = getStudySession();
  if (!session) return null;

  const scope = options?.scope ?? 'current_condition';
  const payload = buildStudyExportPayload(session, scope, getCondition());
  return {
    condition: payload.session.condition,
    ...buildStudySummary(payload.session, { recentLimit: options?.recentLimit }),
  };
}

export function getSessionSummary(): SessionSummary | null {
  const session = getStudySession();
  if (!session) return null;

  return {
    participantId: session.participantId,
    condition: session.condition,
    entryCount: session.entries.length,
    startedAt: session.startedAt,
    isEnded: session.endedAt !== undefined,
  };
}
