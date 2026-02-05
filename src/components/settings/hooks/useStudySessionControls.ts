'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { selectStudyCondition } from '@/lib/store/selectors';
import type { StudyCondition } from '@/lib/types';
import type { SessionSummary } from '@/lib/study';
import {
  getParticipantId,
  initializeSession,
  copyStudyLogToClipboard,
  getSessionSummary,
  resetForNextParticipant,
} from '@/lib/study';

export type StudySessionInfo = SessionSummary | null;
export type CopyStatus = 'idle' | 'copying' | 'copied' | 'error';

export function useStudySessionControls() {
  const setUI = useChatStore((s) => s.setUI);
  const studyCondition = useChatStore(selectStudyCondition);

  const onStudyConditionChange = useCallback(
    (c: StudyCondition) => {
      setUI({ tutor: { studyCondition: c } });
    },
    [setUI],
  );

  const [participantId, setParticipantId] = useState(() => getParticipantId() || '');
  const [studySessionInfo, setStudySessionInfo] = useState<StudySessionInfo>(() =>
    getSessionSummary(),
  );
  const [isResetting, setIsResetting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [copyError, setCopyError] = useState<string | undefined>();
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const onCopyStudyLog = useCallback(async () => {
    if (copyStatus === 'copying') return;

    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);

    setCopyStatus('copying');
    setCopyError(undefined);

    const result = await copyStudyLogToClipboard();
    const nextStatus = result.success ? 'copied' : 'error';
    const resetDelay = result.success ? 2000 : 3000;

    setCopyStatus(nextStatus);
    if (!result.success) setCopyError(result.error);

    copyTimeoutRef.current = setTimeout(() => {
      setCopyStatus('idle');
      setCopyError(undefined);
    }, resetDelay);
  }, [copyStatus]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStudySessionInfo(getSessionSummary());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const onStartStudySession = useCallback(() => {
    const trimmedId = participantId.trim();
    if (!trimmedId) return;
    initializeSession(trimmedId, studyCondition);
    setStudySessionInfo(getSessionSummary());
  }, [participantId, studyCondition]);

  const onResetForNextParticipant = useCallback(async () => {
    const confirmed = window.confirm(
      'This will copy the session log to clipboard, clear all data, and reload the app. Continue?',
    );
    if (!confirmed) return;
    setIsResetting(true);
    await resetForNextParticipant({ exportBeforeReset: true });
  }, []);

  return {
    studyCondition,
    onStudyConditionChange,
    participantId,
    setParticipantId,
    studySessionInfo,
    onStartStudySession,
    onCopyStudyLog,
    copyStatus,
    copyError,
    onResetForNextParticipant,
    isResetting,
  };
}
