'use client';

import { SettingsSection } from '@/components/settings/SettingsSection';
import { useChatStore } from '@/lib/store';
import { MINIMAX_VOICES, DEFAULT_VOICE_CONFIG } from '@/lib/voice/constants';
import type { VoiceInputMode, VADSensitivity } from '@/lib/voice/types';

const VOICE_OPTIONS = [
  { id: MINIMAX_VOICES.FRIENDLY_PERSON, label: 'Friendly', description: 'Warm and approachable' },
  { id: MINIMAX_VOICES.WISE_WOMAN, label: 'Wise', description: 'Thoughtful and measured' },
  { id: MINIMAX_VOICES.NARRATOR, label: 'Narrator', description: 'Clear and articulate' },
  { id: MINIMAX_VOICES.CALM_WOMAN, label: 'Calm', description: 'Soothing and relaxed' },
  { id: MINIMAX_VOICES.YOUNG_KNIGHT, label: 'Energetic', description: 'Upbeat and lively' },
  { id: MINIMAX_VOICES.WARM_WOMAN, label: 'Warm', description: 'Gentle and caring' },
  { id: MINIMAX_VOICES.DEEP_NARRATOR, label: 'Deep', description: 'Rich and resonant' },
] as const;

const INPUT_MODE_OPTIONS: Array<{ id: VoiceInputMode; label: string; description: string }> = [
  {
    id: 'push-to-talk',
    label: 'Push to Talk',
    description: 'Hold the button to speak, release to send',
  },
  {
    id: 'vad',
    label: 'Voice Activity',
    description: 'Automatically detects when you start and stop speaking',
  },
];

const VAD_SENSITIVITY_OPTIONS: Array<{ id: VADSensitivity; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

export function VoicePanel() {
  const voiceConfig = useChatStore((s) => s.voice.voiceConfig);
  const setVoiceConfig = useChatStore((s) => s.setVoiceConfig);

  return (
    <SettingsSection title="Voice">
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2">
          Voice uses your Fal.AI server key. Make sure <code>FAL_KEY</code> is set where the server
          runs.
        </div>
        {/* Voice Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium block">Voice</label>
          <div className="grid grid-cols-2 gap-2">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.id}
                type="button"
                className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                  voiceConfig.voiceId === voice.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                }`}
                onClick={() => setVoiceConfig({ voiceId: voice.id })}
              >
                <div className="text-sm font-medium">{voice.label}</div>
                <div
                  className={`text-xs ${
                    voiceConfig.voiceId === voice.id
                      ? 'text-primary-foreground/80'
                      : 'text-muted-foreground'
                  }`}
                >
                  {voice.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Speech Speed */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Speech Speed</label>
            <span className="text-sm text-muted-foreground">{voiceConfig.speed.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={voiceConfig.speed}
            onChange={(e) => setVoiceConfig({ speed: parseFloat(e.target.value) })}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Slower</span>
            <span>Faster</span>
          </div>
        </div>

        {/* Input Mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium block">Input Mode</label>
          <div className="segmented">
            {INPUT_MODE_OPTIONS.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`segment ${voiceConfig.inputMode === mode.id ? 'is-active' : ''}`}
                onClick={() => setVoiceConfig({ inputMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {INPUT_MODE_OPTIONS.find((m) => m.id === voiceConfig.inputMode)?.description}
          </div>
        </div>

        {/* VAD Sensitivity (only shown when VAD mode is active) */}
        {voiceConfig.inputMode === 'vad' && (
          <div className="space-y-2">
            <label className="text-sm font-medium block">VAD Sensitivity</label>
            <div className="segmented">
              {VAD_SENSITIVITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`segment ${voiceConfig.vadSensitivity === opt.id ? 'is-active' : ''}`}
                  onClick={() => setVoiceConfig({ vadSensitivity: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              Higher sensitivity detects quieter speech but may trigger on background noise.
            </div>
          </div>
        )}

        {/* Reset to Defaults */}
        <button
          type="button"
          className="btn btn-outline text-sm w-full"
          onClick={() => setVoiceConfig(DEFAULT_VOICE_CONFIG)}
        >
          Reset to Defaults
        </button>
      </div>
    </SettingsSection>
  );
}
