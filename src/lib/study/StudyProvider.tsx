'use client';

import { useEffect, type ReactNode } from 'react';
import { useTier } from '@/lib/auth/tierContext';
import { setStudyModeEnabled, resumeSession, getParticipantId } from '@/lib/study';

export function StudyProvider({ children }: { children: ReactNode }) {
  const { tier, isLoading } = useTier();

  useEffect(() => {
    if (isLoading) return;
    const isStudy = tier === 'study';
    setStudyModeEnabled(isStudy);
    if (isStudy && getParticipantId()) {
      resumeSession();
    }
  }, [tier, isLoading]);

  return <>{children}</>;
}
