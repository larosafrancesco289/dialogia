import type { StudySession } from './types';
import { getCondition, getStudySession } from './storage';

export type SessionSummary = {
  participantId: string;
  condition: 'A' | 'B';
  entryCount: number;
  startedAt: number;
  isEnded: boolean;
};

export type StudyLogCopyScope = 'current_condition' | 'full_session';

export function buildStudyExportPayload(
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
