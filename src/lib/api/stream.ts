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
  let pendingData: string[] = [];
  let pendingRaw: string[] = [];

  handlers.onStart?.();

  // Per the SSE spec an event ends at a blank line and its payload is the event's
  // `data:` lines joined with a newline. Dispatching each line on its own would
  // hand callers fragments of a multi-line payload.
  const dispatchEvent = () => {
    const data = pendingData.join('\n');
    const raw = pendingRaw.join('\n');
    const event = pendingEvent;
    pendingData = [];
    pendingRaw = [];
    pendingEvent = undefined;
    if (!data) return;
    if (data === '[DONE]') {
      receivedDone = true;
      return;
    }
    handlers.onMessage({ data, event, raw });
  };

  const consumeLine = (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      dispatchEvent();
      return;
    }
    if (trimmed.startsWith('event:')) {
      pendingRaw.push(rawLine);
      const name = trimmed.slice(6).trim();
      pendingEvent = name || undefined;
      return;
    }
    if (!trimmed.startsWith('data:')) return;
    pendingRaw.push(rawLine);
    const data = trimmed.slice(5).trim();
    if (!data) return;
    pendingData.push(data);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      consumeLine(raw);
      if (receivedDone) break;
    }
    if (receivedDone) break;
  }

  if (!receivedDone) {
    // A stream that ends without a terminating blank line still has one event left.
    if (buffer.trim()) consumeLine(buffer);
    dispatchEvent();
  }

  handlers.onDone?.({ receivedDone });
}
