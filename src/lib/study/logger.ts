import { StudyActionType, StudyLogEntry, StudySession } from './types';
import {
  getParticipantId,
  getCondition,
  getStudySession,
  saveStudySession,
  setParticipantId,
  setCondition,
} from './storage';

let studyModeEnabled = false;

export function setStudyModeEnabled(enabled: boolean): void {
  studyModeEnabled = enabled;
}

export function isStudyModeActive(): boolean {
  return studyModeEnabled && getParticipantId() !== null && getCondition() !== null;
}

export function getStudyModeEnabled(): boolean {
  return studyModeEnabled;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createEntry(
  participantId: string,
  condition: 'A' | 'B',
  action: StudyActionType,
  metadata?: Record<string, unknown>,
): StudyLogEntry {
  return {
    id: generateId(),
    participantId,
    condition,
    timestamp: Date.now(),
    action,
    ...(metadata && { metadata }),
  };
}

export function initializeSession(participantId: string, condition: 'A' | 'B'): StudySession {
  setParticipantId(participantId);
  setCondition(condition);

  const session: StudySession = {
    participantId,
    condition,
    startedAt: Date.now(),
    entries: [createEntry(participantId, condition, 'session_start')],
  };

  saveStudySession(session);
  return session;
}

export function resumeSession(): StudySession | null {
  const session = getStudySession();
  return session && !session.endedAt ? session : null;
}

export function logAction(action: StudyActionType, metadata?: Record<string, unknown>): void {
  if (!isStudyModeActive()) return;

  const session = getStudySession();
  if (!session || session.endedAt) return;

  const participantId = getParticipantId()!;
  const condition = getCondition()!;

  session.entries.push(createEntry(participantId, condition, action, metadata));
  saveStudySession(session);
}

export function endSession(): StudySession | null {
  if (!studyModeEnabled) return null;

  const session = getStudySession();
  if (!session || session.endedAt) return session;

  const participantId = getParticipantId();
  const condition = getCondition();

  if (participantId && condition) {
    session.entries.push(createEntry(participantId, condition, 'session_end'));
  }

  session.endedAt = Date.now();
  saveStudySession(session);
  return session;
}
