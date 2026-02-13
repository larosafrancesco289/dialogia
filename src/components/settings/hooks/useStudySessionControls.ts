'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { selectStudyCondition } from '@/lib/store/selectors';
import type { StudyCondition } from '@/lib/types';
import type { SessionSummary } from '@/lib/study';
import {
  getParticipantId,
  initializeSession,
  setSessionCondition,
  copyStudyLogToClipboard,
  getSessionSummary,
  resetForNextParticipant,
} from '@/lib/study';

export type StudySessionInfo = SessionSummary | null;
export type CopyStatus = 'idle' | 'copying' | 'copied' | 'error';

export function useStudySessionControls() {
  const setUI = useChatStore((s) => s.setUI);
  const studyCondition = useChatStore(selectStudyCondition);

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

  const onStudyConditionChange = useCallback(
    (c: StudyCondition) => {
      if (c === studyCondition) return;

      const hasActiveSession = !!studySessionInfo && !studySessionInfo.isEnded;
      if (hasActiveSession) {
        const confirmed = window.confirm(
          `Switch to Condition ${c}? Subsequent events will be logged under this condition.`,
        );
        if (!confirmed) return;
      }

      setUI({ tutor: { studyCondition: c } });
      setSessionCondition(c);
      setStudySessionInfo(getSessionSummary());
    },
    [setUI, studyCondition, studySessionInfo],
  );

  const onStartStudySession = useCallback(() => {
    const trimmedId = participantId.trim();
    if (!trimmedId) return;
    if (getSessionSummary()) return;
    initializeSession(trimmedId, studyCondition);
    setStudySessionInfo(getSessionSummary());
  }, [participantId, studyCondition]);

  const onResetForNextParticipant = useCallback(async () => {
    const confirmed = window.confirm(
      'This will copy the session log to clipboard, clear all data, and reload the app. Continue?',
    );
    if (!confirmed) return;
    setIsResetting(true);
    try {
      await resetForNextParticipant({ exportBeforeReset: true });
    } finally {
      setIsResetting(false);
    }
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
