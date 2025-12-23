type NdjsonWriter = {
  send: (payload: unknown) => void;
  close: () => void;
};

export function createNdjsonStream(
  handler: (writer: NdjsonWriter) => Promise<void>,
  opts?: { onError?: (error: unknown) => unknown },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  return new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        const chunk = `${JSON.stringify(payload)}\n`;
        controller.enqueue(encoder.encode(chunk));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      try {
        await handler({ send, close });
        close();
      } catch (error) {
        const payload = opts?.onError
          ? opts.onError(error)
          : { type: 'error', error: String((error as Error)?.message || error) };
        if (payload) send(payload);
        close();
      }
    },
  });
}
