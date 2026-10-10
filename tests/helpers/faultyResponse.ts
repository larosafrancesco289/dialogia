// A streamed response that goes wrong the ways networks do: the connection
// closes early, goes quiet, or errors partway through a chunk.

const encoder = new TextEncoder();

export type Fault =
  /** The connection closes cleanly after the chunks, with no terminator. */
  | { kind: 'truncate' }
  /** The chunks arrive, then nothing more, ever. */
  | { kind: 'stall' }
  /** The chunks arrive, then the read fails with `error`. */
  | { kind: 'error'; error: Error }
  /** The chunks arrive, then a keep-alive comment every `everyMs`, `times` times, then `tail`. */
  | { kind: 'keepAlive'; everyMs: number; times: number; tail: string[] };

export function faultyResponse(chunks: string[], fault: Fault): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      switch (fault.kind) {
        case 'truncate':
          controller.close();
          return;
        case 'stall':
          return;
        case 'error':
          controller.error(fault.error);
          return;
        case 'keepAlive':
          for (let i = 0; i < fault.times; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, fault.everyMs));
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          }
          for (const chunk of fault.tail) controller.enqueue(encoder.encode(chunk));
          controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** One OpenAI-style chunk, as an SSE event. */
export const openAiChunk = (payload: Record<string, unknown>) =>
  `data: ${JSON.stringify(payload)}\n\n`;

/** One Anthropic event, as an SSE event. */
export const anthropicEvent = (payload: { type: string } & Record<string, unknown>) =>
  `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
