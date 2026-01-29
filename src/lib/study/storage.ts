import { StudySession } from './types';

const PARTICIPANT_KEY = 'dialogia-study-participant';
const CONDITION_KEY = 'dialogia-study-condition';
const SESSION_KEY = 'dialogia-study-log';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getParticipantId(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(PARTICIPANT_KEY);
}

export function setParticipantId(id: string): void {
  if (!isBrowser()) return;
  localStorage.setItem(PARTICIPANT_KEY, id);
}

export function clearParticipantId(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PARTICIPANT_KEY);
}

export function getCondition(): 'A' | 'B' | null {
  if (!isBrowser()) return null;
  const value = localStorage.getItem(CONDITION_KEY);
  if (value === 'A' || value === 'B') return value;
  return null;
}

export function setCondition(condition: 'A' | 'B'): void {
  if (!isBrowser()) return;
  localStorage.setItem(CONDITION_KEY, condition);
}

export function clearCondition(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(CONDITION_KEY);
}

export function getStudySession(): StudySession | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudySession;
  } catch {
    return null;
  }
}

export function saveStudySession(session: StudySession): void {
  if (!isBrowser()) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStudySession(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_KEY);
}

export function clearAllStudyStorage(): void {
  clearParticipantId();
  clearCondition();
  clearStudySession();
}
