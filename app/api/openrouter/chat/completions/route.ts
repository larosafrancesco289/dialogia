import { orChatCompletions } from '@/lib/openrouter/http';
import { resolveOpenRouterAccess } from '@/lib/openrouter/pipeline.server';
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

export const POST = route('openrouter-chat')
  .rateLimit('openrouter-chat', RATE_LIMITS.EXPENSIVE)
  .handler(async (req) => {
    let access: Awaited<ReturnType<typeof resolveOpenRouterAccess>>;
    try {
      access = await resolveOpenRouterAccess();
    } catch {
      return jsonError(500, 'missing_env', 'OPENROUTER_API_KEY');
    }

    return withProxyErrors(async () => {
      const bodyText = await req.text();
      const { body, stream } = parseProxyBody(bodyText);

      // Validate model access for free tier
      if (typeof body?.model === 'string') {
        const allowed = await access.canUseModel(body.model);
        if (!allowed) {
          return jsonError(
            403,
            'model_not_allowed',
            'This model is not available on the free tier',
          );
        }
      }

      const res = await orChatCompletions({
        auth: access.auth,
        body: bodyText,
        stream,
        origin: getRequestOrigin(req),
      });

      return stream ? proxyStream(res) : proxyJson(res);
    }, 'proxy_error');
  });
