import type { VoiceSessionStatus } from '@/lib/voice/events';

export class VoiceAudioPlayback {
  private audioContext: AudioContext;
  private sampleRate: number;
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private onStatus?: (status: VoiceSessionStatus) => void;

  constructor(opts: {
    audioContext: AudioContext;
    sampleRate: number;
    onStatus?: (status: VoiceSessionStatus) => void;
  }) {
    this.audioContext = opts.audioContext;
    this.sampleRate = opts.sampleRate;
    this.onStatus = opts.onStatus;
  }

  enqueue(audioData: Float32Array) {
    if (!this.audioContext) return;
    this.audioQueue.push(audioData);
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.onStatus?.({ speaking: true });
    void this.playNext();
  }

  reset() {
    this.audioQueue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // ignore
      }
      this.currentSource = null;
    }
    if (this.isPlaying) {
      this.isPlaying = false;
      this.onStatus?.({ speaking: false });
    }
  }

  stop() {
    this.reset();
  }

  private async playNext() {
    const chunk = this.audioQueue.shift();
    if (!chunk || !this.audioContext) {
      this.isPlaying = false;
      this.onStatus?.({ speaking: false });
      return;
    }

    const audioBuffer = this.audioContext.createBuffer(1, chunk.length, this.sampleRate);
    audioBuffer.copyToChannel(new Float32Array(chunk), 0);

    const source = this.audioContext.createBufferSource();
    this.currentSource = source;
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.onended = () => {
      if (this.currentSource === source) this.currentSource = null;
      void this.playNext();
    };
    source.start();
  }
}
