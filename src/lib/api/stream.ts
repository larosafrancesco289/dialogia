// Module: api/stream
// Responsibility: Shared helpers for consuming Server-Sent Event (SSE) streams.

import { ApiError } from '@/lib/api/errors';

export type SseHandlers = {
  onStart?: () => void;
  onMessage: (data: string) => void;
  onDone?: (info: { receivedDone: boolean }) => void;
};

export async function consumeSse(response: Response, handlers: SseHandlers): Promise<void> {
  const body = response.body;
  if (!body) throw new ApiError({ code: 'stream_missing_body', status: response.status });
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;

  handlers.onStart?.();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === '[DONE]') {
        receivedDone = true;
        break;
      }
      handlers.onMessage(data);
    }
    if (receivedDone) break;
  }

  const trailing = buffer.trim();
  if (!receivedDone && trailing.startsWith('data:')) {
    const data = trailing.slice(5).trim();
    if (data === '[DONE]') {
      receivedDone = true;
    } else if (data) {
      handlers.onMessage(data);
    }
  }

  handlers.onDone?.({ receivedDone });
}
