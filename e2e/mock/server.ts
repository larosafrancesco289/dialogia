// A stand-in OpenAI-compatible server for the end-to-end tests, and for
// trying the app by hand without a key: connect it as "Your own server" at
// http://localhost:<port>/v1.
//
// Models: mock-fast, mock-slow (drips after a pause), mock-think (reasoning
// first), mock-long (long markdown). Markers in the last user message change
// one reply:
//   [delay=ms]   wait before the first token        [tick=ms]  ms per chunk
//   [think]      reason first                       [cut]      close halfway, no ending
//   [stall]      send half, then nothing, ever      [status=N] fail with HTTP N
// GET /__requests lists the request bodies received, newest last, for tests
// that check what the app sent; DELETE /__requests clears them.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = Number(process.env.PORT || 4399);

export const MOCK_MODELS = ['mock-fast', 'mock-slow', 'mock-think', 'mock-long'];

export const SHORT_REPLY = `Sure. Here is a short reply with **bold** text and a list:

- one
- two
- three

Done.`;

const LONG_REPLY = `## A long answer

Here is a paragraph with **bold**, *italic* and \`inline code\`. It goes on for a while so that it wraps across a few lines in the message column.

1. First point, with a little detail.
2. Second point, inline maths $e^{i\\pi} + 1 = 0$.
3. Third point.

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

\`\`\`ts
function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

> A quote.

| Column A | Column B |
| --- | --- |
| one | two |

${Array.from({ length: 14 }, (_, i) => `Paragraph ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`).join('\n\n')}

That is the end.`;

const THINKING = 'Let me think about this. I should consider the options and then reply concisely.';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
};

type ChatBody = {
  model?: string;
  stream?: boolean;
  messages?: Array<{ role: string; content: unknown }>;
};

const received: unknown[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text) : ''))
    .join(' ');
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<ChatBody> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? (JSON.parse(raw) as ChatBody) : {};
}

async function chat(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req);
  received.push(body);
  const model = body.model ?? 'mock-fast';
  const messages = body.messages ?? [];
  const lastUser = textOf([...messages].reverse().find((m) => m.role === 'user')?.content);
  const marker = (name: string) => new RegExp(`\\[${name}(?:=(\\d+))?\\]`).exec(lastUser);

  const status = marker('status');
  if (status?.[1]) {
    json(res, Number(status[1]), { error: { message: `Mock failure ${status[1]}` } });
    return;
  }

  if (!body.stream) {
    json(res, 200, {
      id: 'mock',
      object: 'chat.completion',
      choices: [
        { index: 0, message: { role: 'assistant', content: 'Mock title' }, finish_reason: 'stop' },
      ],
    });
    return;
  }

  const delay = Number(marker('delay')?.[1] ?? (model === 'mock-slow' ? 2500 : 100));
  const tick = Number(marker('tick')?.[1] ?? (model === 'mock-slow' ? 90 : 15));
  const think = model === 'mock-think' || !!marker('think');
  const pieces = chunks(model === 'mock-long' ? LONG_REPLY : SHORT_REPLY, 5);
  const cut = !!marker('cut');
  const stall = !!marker('stall');

  res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  let closed = false;
  res.on('close', () => {
    closed = true;
  });
  const send = (payload: unknown) => {
    if (!closed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  await sleep(delay);
  if (think) {
    for (const piece of chunks(THINKING, 6)) {
      if (closed) return;
      send({ id: 'mock', choices: [{ index: 0, delta: { reasoning_content: piece } }] });
      await sleep(tick);
    }
  }
  const stopAt = cut || stall ? Math.floor(pieces.length / 2) : pieces.length;
  for (const piece of pieces.slice(0, stopAt)) {
    if (closed) return;
    send({ id: 'mock', choices: [{ index: 0, delta: { content: piece } }] });
    await sleep(tick);
  }
  if (stall) return; // The connection stays open and silent until the client gives up.
  if (cut) {
    res.end();
    return;
  }
  send({ id: 'mock', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
  if (!closed) res.end('data: [DONE]\n\n');
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (url.pathname === '/__requests') {
    if (req.method === 'DELETE') received.length = 0;
    json(res, 200, received);
    return;
  }
  if (url.pathname.endsWith('/models')) {
    json(res, 200, { data: MOCK_MODELS.map((id) => ({ id, object: 'model' })) });
    return;
  }
  if (url.pathname.endsWith('/chat/completions') && req.method === 'POST') {
    chat(req, res).catch((error: unknown) => {
      if (!res.headersSent) json(res, 500, { error: { message: String(error) } });
      else res.end();
    });
    return;
  }
  json(res, 404, { error: { message: 'Not found' } });
});

server.listen(PORT, () => {
  console.log(`mock LLM on http://localhost:${PORT}/v1`);
});
