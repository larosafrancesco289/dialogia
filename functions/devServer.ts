import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Dev-only bridge between Vite's Node dev server and the worker's API routes.
 * Without it `bun run dev` has no `/api/*` at all, so proxy mode has nowhere to
 * send model traffic. Production never goes through here: Cloudflare invokes
 * `functions/worker.ts` directly.
 */

type RouteResolver = (
  pathname: string,
  method: string,
) => ((req: Request) => Promise<Response>) | undefined;

async function readBody(req: IncomingMessage): Promise<string | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  // The API surface is JSON only, so a decoded string keeps this free of
  // BodyInit typing differences between the DOM and Node lib definitions.
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
}

function toRequest(req: IncomingMessage, body: string | undefined): Request {
  const host = req.headers.host ?? 'localhost';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    for (const entry of Array.isArray(value) ? value : [value]) headers.append(key, entry);
  }
  return new Request(`http://${host}${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers,
    body,
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers = new Headers(response.headers);
  const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  headers.delete('set-cookie');
  for (const [key, value] of headers.entries()) res.setHeader(key, value);
  if (setCookies.length) res.setHeader('set-cookie', setCookies);
  res.statusCode = response.status;

  if (!response.body) {
    res.end();
    return;
  }
  // Piped rather than buffered so streamed completions still stream in dev.
  Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
}

export async function handleDevApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  resolveApiRoute: RouteResolver,
): Promise<boolean> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const handler = resolveApiRoute(pathname, req.method ?? 'GET');
  if (!handler) return false;

  const body = await readBody(req);
  const response = await handler(toRequest(req, body));
  await writeResponse(res, response);
  return true;
}
