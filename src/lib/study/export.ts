import { getStudySession } from './storage';

export type SessionSummary = {
  participantId: string;
  condition: 'A' | 'B';
  entryCount: number;
  startedAt: number;
  isEnded: boolean;
};

export function downloadStudyLog(): boolean {
  const session = getStudySession();
  if (!session) return false;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `dialogia-study-${session.participantId}-${timestamp}.json`;
  const json = JSON.stringify(session, null, 2);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return true;
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
