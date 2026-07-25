import type { RouteHandler } from '@/lib/server/routeBuilder';
import { GET as anthropicModels } from './api/anthropic/models';
import { POST as anthropicMessages } from './api/anthropic/messages';
import { GET as authDebug } from './api/auth/debug';
import { POST as authSetFreeTier } from './api/auth/setFreeTier';
import { POST as authVerifyCode } from './api/auth/verifyCode';
import { POST as openrouterChatCompletions } from './api/openrouter/chatCompletions';
import { GET as openrouterModels } from './api/openrouter/models';
import { GET as openrouterZdrEndpoints } from './api/openrouter/zdrEndpoints';
import { GET as tavilySearch } from './api/tavily';

type MethodTable = Partial<Record<'GET' | 'POST', RouteHandler>>;

export const API_ROUTES: Record<string, MethodTable> = {
  '/api/anthropic/messages': { POST: anthropicMessages },
  '/api/anthropic/models': { GET: anthropicModels },
  '/api/auth/debug': { GET: authDebug },
  '/api/auth/set-free-tier': { POST: authSetFreeTier },
  '/api/auth/verify-code': { POST: authVerifyCode },
  '/api/openrouter/chat/completions': { POST: openrouterChatCompletions },
  '/api/openrouter/endpoints/zdr': { GET: openrouterZdrEndpoints },
  '/api/openrouter/models': { GET: openrouterModels },
  '/api/tavily': { GET: tavilySearch },
};

export function resolveApiRoute(pathname: string, method: string): RouteHandler | undefined {
  const table = API_ROUTES[pathname];
  if (!table) return undefined;
  return table[method as 'GET' | 'POST'];
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}
