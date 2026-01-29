// Module: agent/streaming/typewriter
// Responsibility: Smooth typewriter effect for streaming text output.

/**
 * Configuration for the typewriter effect.
 */
export type TypewriterConfig = {
  /** Target frame interval in ms (default: 16 for ~60fps) */
  frameInterval?: number;
  /** Minimum chars to emit per frame to avoid per-char overhead (default: 2) */
  minCharsPerFrame?: number;
  /** Buffer size threshold for immediate passthrough (default: 10) */
  passthroughThreshold?: number;
  /** How quickly to drain remaining buffer on completion (chars per frame, default: 20) */
  drainRate?: number;
};

const DEFAULT_CONFIG: Required<TypewriterConfig> = {
  frameInterval: 16, // ~60fps
  minCharsPerFrame: 2,
  passthroughThreshold: 10,
  drainRate: 20,
};

/**
 * Creates an adaptive typewriter buffer that smooths streaming text output.
 * - Passes through content quickly when buffer is small (low latency)
 * - Smooths out bursts by spreading large chunks across frames
 * - Adapts emission rate to match incoming token velocity
 * - Drains remaining content quickly but smoothly on completion
 */
export function createTypewriter(onEmit: (text: string) => void, config?: TypewriterConfig) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  let completionResolve: (() => void) | null = null;

  // Track incoming velocity for adaptive emission
  let lastPushTime = 0;
  let estimatedCharsPerSecond = 500; // Start with reasonable default

  const scheduleNext = () => {
    if (timer) return; // Already scheduled
    if (buffer.length === 0) {
      if (done && completionResolve) {
        completionResolve();
        completionResolve = null;
      }
      return;
    }

    // Calculate how many chars to emit this frame
    let charsToEmit: number;

    if (done) {
      // Stream complete - drain quickly but not all at once
      charsToEmit = Math.min(buffer.length, cfg.drainRate);
    } else if (buffer.length <= cfg.passthroughThreshold) {
      // Small buffer - emit everything for low latency
      charsToEmit = buffer.length;
    } else {
      // Larger buffer - emit based on estimated incoming rate
      // Emit slightly more than we're receiving to catch up
      const charsPerFrame = Math.ceil((estimatedCharsPerSecond * cfg.frameInterval) / 1000);
      // Emit at least minCharsPerFrame, at most the whole buffer
      // Add 20% extra to gradually drain buffer
      charsToEmit = Math.min(
        buffer.length,
        Math.max(cfg.minCharsPerFrame, Math.ceil(charsPerFrame * 1.2)),
      );
    }

    timer = setTimeout(() => {
      timer = null;

      if (buffer.length === 0) {
        if (done && completionResolve) {
          completionResolve();
          completionResolve = null;
        }
        return;
      }

      // Emit characters
      const toEmit = buffer.slice(0, charsToEmit);
      buffer = buffer.slice(charsToEmit);
      onEmit(toEmit);

      // Schedule next emission
      scheduleNext();
    }, cfg.frameInterval);
  };

  return {
    /** Add text to the buffer */
    push(text: string) {
      if (!text) return;

      // Update velocity estimate
      const now = performance.now();
      if (lastPushTime > 0) {
        const elapsed = now - lastPushTime;
        if (elapsed > 0 && elapsed < 2000) {
          // Update moving average of incoming rate
          const instantRate = (text.length / elapsed) * 1000;
          // Exponential moving average with fast adaptation
          estimatedCharsPerSecond = estimatedCharsPerSecond * 0.7 + instantRate * 0.3;
        }
      }
      lastPushTime = now;

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
      if (completionResolve) {
        completionResolve();
        completionResolve = null;
      }
    },

    /**
     * Signal that no more content will arrive and drain buffer smoothly.
     * Returns a Promise that resolves when all buffered content has been emitted.
     */
    complete(): Promise<void> {
      done = true;
      if (buffer.length === 0 && !timer) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        completionResolve = resolve;
        scheduleNext();
      });
    },

    /** Get current buffer size (for debugging) */
    get bufferSize() {
      return buffer.length;
    },
  };
}
