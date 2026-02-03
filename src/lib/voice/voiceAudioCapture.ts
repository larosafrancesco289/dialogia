export class VoiceAudioCapture {
  private audioContext: AudioContext;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private readonly sampleRate: number;
  private readonly workletUrl: string;
  private readonly onChunk: (chunk: Float32Array) => void;

  constructor(opts: {
    audioContext: AudioContext;
    sampleRate: number;
    workletUrl?: string;
    onChunk: (chunk: Float32Array) => void;
  }) {
    this.audioContext = opts.audioContext;
    this.sampleRate = opts.sampleRate;
    this.workletUrl = opts.workletUrl ?? '/worklets/audio-processor.js';
    this.onChunk = opts.onChunk;
  }

  async start() {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    await this.audioContext.audioWorklet.addModule(this.workletUrl);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
    this.workletNode.port.onmessage = (event) => {
      this.onChunk(event.data as Float32Array);
    };
    this.sourceNode.connect(this.workletNode);
  }

  stop() {
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      this.mediaStream = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }
  }

  getStream() {
    return this.mediaStream;
  }
}
