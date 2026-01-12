// Module: agent/streaming/typewriter
// Responsibility: Smooth typewriter effect for streaming text output.

/**
 * Configuration for the typewriter effect.
 */
export type TypewriterConfig = {
  /** Base interval between character emissions in ms (default: 12) */
  baseInterval?: number;
  /** Minimum interval when catching up with buffered content (default: 4) */
  minInterval?: number;
  /** Characters per batch when buffer is large (default: 3) */
  batchSize?: number;
  /** Buffer threshold to trigger faster emission (default: 50) */
  catchUpThreshold?: number;
};

const DEFAULT_CONFIG: Required<TypewriterConfig> = {
  baseInterval: 12,
  minInterval: 4,
  batchSize: 3,
  catchUpThreshold: 50,
};

/**
 * Creates a typewriter buffer that smoothly emits characters at a consistent rate.
 * - Buffers incoming text chunks
 * - Emits characters at a steady cadence for smooth visual effect
 * - Speeds up when buffer grows large to prevent lag
 * - Flushes remaining content on completion
 */
export function createTypewriter(onEmit: (text: string) => void, config?: TypewriterConfig) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const scheduleNext = () => {
    if (timer) return; // Already scheduled
    if (buffer.length === 0) {
      if (done) return; // Nothing left to do
      return; // Wait for more content
    }

    // Calculate interval based on buffer size
    const bufferSize = buffer.length;
    let interval = cfg.baseInterval;
    let charsToEmit = 1;

    if (bufferSize > cfg.catchUpThreshold) {
      // Speed up to catch up with buffer
      interval = cfg.minInterval;
      charsToEmit = cfg.batchSize;
    } else if (bufferSize > cfg.catchUpThreshold / 2) {
      // Slightly faster
      interval = Math.max(cfg.minInterval, cfg.baseInterval / 2);
      charsToEmit = 2;
    }

    timer = setTimeout(() => {
      timer = null;

      if (buffer.length === 0) {
        if (!done) scheduleNext();
        return;
      }

      // Emit characters
      const toEmit = buffer.slice(0, charsToEmit);
      buffer = buffer.slice(charsToEmit);
      onEmit(toEmit);

      // Schedule next emission
      scheduleNext();
    }, interval);
  };

  return {
    /** Add text to the buffer */
    push(text: string) {
      if (!text) return;
      buffer += text;
      scheduleNext();
    },

    /** Flush all remaining content immediately */
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (buffer.length > 0) {
        onEmit(buffer);
        buffer = '';
      }
    },

    /** Signal that no more content will arrive */
    complete() {
      done = true;
      // Flush remaining content
      this.flush();
    },

    /** Get current buffer size (for debugging) */
    get bufferSize() {
      return buffer.length;
    },
  };
}
