// Module: voice/sentenceChunker
// Responsibility: Buffer LLM tokens and emit complete sentences for TTS

import { MIN_SENTENCE_LENGTH } from './constants';

/**
 * SentenceChunker buffers streaming LLM tokens and emits complete sentences
 * suitable for text-to-speech. This enables incremental TTS generation
 * while the LLM is still producing tokens.
 */
export class SentenceChunker {
  private buffer = '';
  private minChunkSize: number;

  constructor(options?: { minChunkSize?: number }) {
    this.minChunkSize = options?.minChunkSize ?? MIN_SENTENCE_LENGTH;
  }

  /**
   * Add text delta from LLM stream and return any complete sentences
   */
  addText(delta: string): string[] {
    this.buffer += delta;
    const chunks: string[] = [];

    // Look for sentence boundaries: . ! ? followed by space or end
    // Also include ; and : for natural pauses in longer content
    const sentencePattern = /[.!?]["\u201d]?\s+|[;:]\s+/g;

    let lastEnd = 0;
    let match: RegExpExecArray | null;

    while ((match = sentencePattern.exec(this.buffer)) !== null) {
      const chunk = this.buffer.slice(lastEnd, match.index + match[0].length - 1).trim();

      if (chunk.length >= this.minChunkSize) {
        chunks.push(chunk);
        lastEnd = match.index + match[0].length;
      }
    }

    // Keep the remaining buffer
    if (lastEnd > 0) {
      this.buffer = this.buffer.slice(lastEnd);
    }

    return chunks;
  }

  /**
   * Flush any remaining text in the buffer (call when LLM is done)
   */
  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = '';

    if (remaining.length > 0) {
      return remaining;
    }
    return null;
  }

  /**
   * Reset the chunker state
   */
  reset(): void {
    this.buffer = '';
  }

  /**
   * Get current buffer contents (for debugging)
   */
  getBuffer(): string {
    return this.buffer;
  }
}

/**
 * Creates a sentence chunker with callbacks for easier streaming integration
 */
export function createSentenceChunkerStream(callbacks: {
  onSentence: (sentence: string) => void;
  onComplete?: () => void;
}) {
  const chunker = new SentenceChunker();

  return {
    /**
     * Process incoming text delta
     */
    push(delta: string): void {
      const sentences = chunker.addText(delta);
      for (const sentence of sentences) {
        callbacks.onSentence(sentence);
      }
    },

    /**
     * Signal that the stream is complete and flush remaining buffer
     */
    complete(): void {
      const remaining = chunker.flush();
      if (remaining) {
        callbacks.onSentence(remaining);
      }
      callbacks.onComplete?.();
    },

    /**
     * Reset the chunker state
     */
    reset(): void {
      chunker.reset();
    },
  };
}
