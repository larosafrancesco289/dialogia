'use client';
import { useCallback, useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { selectStudyCondition } from '@/lib/store/selectors';
import type { StudyCondition } from '@/lib/types';
import type { SessionSummary } from '@/lib/study';
import {
  getParticipantId,
  initializeSession,
  downloadStudyLog,
  getSessionSummary,
  resetForNextParticipant,
} from '@/lib/study';

export type StudySessionInfo = SessionSummary | null;

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
      'This will export the current log, clear all data, and reload the app. Continue?',
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
    onExportStudyLog: downloadStudyLog,
    onResetForNextParticipant,
    isResetting,
  };
}
