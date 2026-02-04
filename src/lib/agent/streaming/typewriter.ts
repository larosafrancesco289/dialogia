// Module: agent/streaming/typewriter
// Responsibility: Smooth typewriter effect for streaming text output.

/**
 * Configuration for the typewriter effect.
 */
export type TypewriterConfig = {
  /** Target minimum frame interval in ms (default: 32 for ~30fps) */
  frameInterval?: number;
  /** Minimum chars to emit per frame to avoid per-char overhead (default: 2) */
  minCharsPerFrame?: number;
  /** Maximum chars to emit per frame to avoid large jumps (default: 120) */
  maxCharsPerFrame?: number;
  /** Buffer size threshold for immediate passthrough (default: 10) */
  passthroughThreshold?: number;
  /** How quickly to drain remaining buffer on completion (chars per frame, default: 20) */
  drainRate?: number;
};

const DEFAULT_CONFIG: Required<TypewriterConfig> = {
  frameInterval: 32, // ~30fps to reduce UI thrash
  minCharsPerFrame: 3,
  maxCharsPerFrame: 120,
  passthroughThreshold: 24,
  drainRate: 80,
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
  let rafId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  let completionResolve: (() => void) | null = null;
  let lastEmitTime = 0;

  // Track incoming velocity for adaptive emission
  let lastPushTime = 0;
  let estimatedCharsPerSecond = 420; // Start with reasonable default
  let carry = 0;

  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const clearTimers = () => {
    if (rafId != null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      rafId = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const tick = (now: number) => {
    rafId = null;
    timeoutId = null;

    if (buffer.length === 0) {
      if (done && completionResolve) {
        completionResolve();
        completionResolve = null;
      }
      return;
    }

    const elapsed = lastEmitTime ? now - lastEmitTime : cfg.frameInterval;
    const allowImmediate = buffer.length <= cfg.passthroughThreshold || done;
    if (!allowImmediate && elapsed < cfg.frameInterval) {
      scheduleNext();
      return;
    }
    lastEmitTime = now;

    // Calculate how many chars to emit this frame
    let charsToEmit: number;

    if (done) {
      // Stream complete - drain quickly but not all at once
      charsToEmit = Math.min(buffer.length, cfg.drainRate);
    } else if (buffer.length <= cfg.passthroughThreshold) {
      // Small buffer - emit everything for low latency
      charsToEmit = buffer.length;
    } else {
      const targetRate = Math.max(60, estimatedCharsPerSecond);
      carry = Math.min(
        carry + (targetRate * Math.max(elapsed, cfg.frameInterval)) / 1000,
        cfg.maxCharsPerFrame * 3,
      );
      const budget = Math.floor(carry);
      charsToEmit = Math.min(
        buffer.length,
        Math.max(cfg.minCharsPerFrame, Math.min(cfg.maxCharsPerFrame, budget)),
      );
      carry = Math.max(0, carry - charsToEmit);
    }

    if (charsToEmit <= 0) {
      scheduleNext();
      return;
    }

    // Emit characters
    const toEmit = buffer.slice(0, charsToEmit);
    buffer = buffer.slice(charsToEmit);
    onEmit(toEmit);

    // Schedule next emission
    scheduleNext();
  };

  const scheduleNext = () => {
    if (rafId != null || timeoutId) return; // Already scheduled
    if (buffer.length === 0) {
      if (done && completionResolve) {
        completionResolve();
        completionResolve = null;
      }
      return;
    }

    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(tick);
    } else {
      timeoutId = setTimeout(() => tick(nowMs()), cfg.frameInterval);
    }
  };

  return {
    /** Add text to the buffer */
    push(text: string) {
      if (!text) return;

      // Update velocity estimate
      const now = nowMs();
      if (lastPushTime > 0) {
        const elapsed = now - lastPushTime;
        if (elapsed > 0 && elapsed < 2000) {
          // Update moving average of incoming rate
          const instantRate = (text.length / elapsed) * 1000;
          const clamped = Math.min(Math.max(instantRate, 30), 4000);
          // Exponential moving average with slower adaptation to avoid jitter
          estimatedCharsPerSecond = estimatedCharsPerSecond * 0.85 + clamped * 0.15;
        }
      }
      lastPushTime = now;

      buffer += text;
      scheduleNext();
    },

    /** Flush all remaining content immediately */
    flush() {
      clearTimers();
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
      if (buffer.length === 0 && rafId == null && !timeoutId) {
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
