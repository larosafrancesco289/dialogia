'use client';

import { createContext, useContext, type PropsWithChildren } from 'react';
import { useVoicePipeline, type UseVoicePipelineResult } from '@/lib/hooks/useVoicePipeline';

const VoiceContext = createContext<UseVoicePipelineResult | null>(null);

export function VoiceProvider({ children }: PropsWithChildren) {
  const voice = useVoicePipeline();
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}

export default VoiceProvider;
