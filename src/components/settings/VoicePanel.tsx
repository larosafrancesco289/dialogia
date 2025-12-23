'use client';

import { SettingsSection } from '@/components/settings/SettingsSection';
import { useChatStore } from '@/lib/store';
import { VOICE_OPTIONS, type XAIVoice } from '@/lib/voice/types';

export function VoicePanel() {
  const voiceConfig = useChatStore((s) => s.voice.config);
  const setVoiceConfig = useChatStore((s) => s.setVoiceConfig);

  return (
    <SettingsSection title="Voice Assistant">
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm block">Voice</label>
          <select
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            value={voiceConfig.voice}
            onChange={(e) => setVoiceConfig({ voice: e.target.value as XAIVoice })}
          >
            {VOICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.description}
              </option>
            ))}
          </select>
          <div className="text-xs text-muted-foreground">
            Select the voice for the xAI voice assistant. Click the microphone button in the
            composer to start a voice conversation.
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
