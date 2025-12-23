export type MessageMetrics = {
  ttftMs?: number; // time to first token (ms)
  completionMs?: number; // total time until done (ms)
  promptTokens?: number;
  completionTokens?: number;
  tokensPerSec?: number; // actual throughput when usage present
};
