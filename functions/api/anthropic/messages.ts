import { anMessages } from '@/lib/anthropic/http';
import { resolveAnthropicAccess } from '@/lib/anthropic/pipeline.server';
import { jsonError } from '@/lib/server/route';
import {
  getRequestOrigin,
  parseProxyBody,
  proxyJson,
  proxyStream,
  withProxyErrors,
} from '@/lib/server/proxy';
import { route } from '@/lib/server/routeBuilder';
import { RATE_LIMITS } from '@/lib/server/rateLimit';

export const POST = route('anthropic-messages')
  .rateLimit('anthropic-messages', RATE_LIMITS.ANTHROPIC_CHAT)
  .handler(async (req) => {
    let access: ReturnType<typeof resolveAnthropicAccess>;
    try {
      access = resolveAnthropicAccess(req);
    } catch {
      return jsonError(500, 'missing_env', 'ANTHROPIC_API_KEY');
    }

    return withProxyErrors(async () => {
      const bodyText = await req.text();
      const { stream } = parseProxyBody(bodyText);

      const res = await anMessages({
        auth: access.auth,
        body: bodyText,
        stream,
        origin: getRequestOrigin(req),
      });

      return stream
        ? proxyStream(res, { contentType: 'text/event-stream' })
        : proxyJson(res, { contentType: 'application/json' });
    }, 'proxy_error');
  });
