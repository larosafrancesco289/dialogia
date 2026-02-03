class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const newBuffer = new Float32Array(this.buffer.length + input[0].length);
      newBuffer.set(this.buffer);
      newBuffer.set(input[0], this.buffer.length);
      this.buffer = newBuffer;

      while (this.buffer.length >= 2400) {
        const chunk = this.buffer.slice(0, 2400);
        this.buffer = this.buffer.slice(2400);
        this.port.postMessage(chunk);
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
