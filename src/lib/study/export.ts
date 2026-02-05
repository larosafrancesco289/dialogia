import { getStudySession } from './storage';

export type SessionSummary = {
  participantId: string;
  condition: 'A' | 'B';
  entryCount: number;
  startedAt: number;
  isEnded: boolean;
};

export async function copyStudyLogToClipboard(): Promise<{ success: boolean; error?: string }> {
  const session = getStudySession();
  if (!session) return { success: false, error: 'No active session' };

  const json = JSON.stringify(session, null, 2);

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
