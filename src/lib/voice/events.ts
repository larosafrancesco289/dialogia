export type VoiceSessionStatus = {
  active?: boolean;
  connected?: boolean;
  listening?: boolean;
  speaking?: boolean;
};

export type VoiceSessionEvent =
  | { type: 'status'; status: VoiceSessionStatus }
  | { type: 'user_message'; content: string }
  | { type: 'assistant_message'; content: string }
  | { type: 'error'; message: string | null };

export type VoiceSessionEventHandler = (event: VoiceSessionEvent) => void;

export type VoiceTransportEvent =
  | VoiceSessionEvent
  | { type: 'audio_delta'; audio: Float32Array }
  | { type: 'speech_started' };
