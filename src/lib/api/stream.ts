// Module: api/stream
// Responsibility: Shared helpers for consuming Server-Sent Event (SSE) streams.

import { ApiError, API_ERROR_CODES } from '@/lib/api/errors';

export type SseEvent = {
  data: string;
  event?: string;
  raw: string;
};

export type SseHandlers = {
  onStart?: () => void;
  onMessage: (event: SseEvent) => void;
  onDone?: (info: { receivedDone: boolean }) => void;
};

export async function consumeSse(response: Response, handlers: SseHandlers): Promise<void> {
  const body = response.body;
  if (!body)
    throw new ApiError({ code: API_ERROR_CODES.STREAM_MISSING_BODY, status: response.status });
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;
  let pendingEvent: string | undefined;

  handlers.onStart?.();

  const flushLine = (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('event:')) {
      const name = trimmed.slice(6).trim();
      pendingEvent = name || undefined;
      return;
    }
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') {
      receivedDone = true;
      pendingEvent = undefined;
      return;
    }
    handlers.onMessage({ data, event: pendingEvent, raw: rawLine });
    pendingEvent = undefined;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      flushLine(raw);
      if (receivedDone) break;
    }
    if (receivedDone) break;
  }

  const trailing = buffer.trim();
  if (!receivedDone && trailing) {
    flushLine(trailing);
  }

  handlers.onDone?.({ receivedDone });
}
