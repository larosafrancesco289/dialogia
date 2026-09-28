// Module: search/api/jina
// Responsibility: Read one page through Jina Reader, which needs no key.
//
// Verified September 2026: r.jina.ai answers any origin and allows about 20
// requests a minute per IP without a key. That allowance is a courtesy Jina has
// not written down, so a refusal must read as Jina's, not ours.

import type { WebFetchArgs } from '@/lib/search/args';
import type { FetchedPage } from '@/lib/search/providers/types';
import { normalizeWebUrl, SearchStatusError } from '@/lib/search/api/shared';
import { isRecord } from '@/lib/utils/guards';

const JINA_READER_URL = 'https://r.jina.ai/';

export async function runJinaRead(
  args: WebFetchArgs,
  opts: { signal?: AbortSignal } = {},
): Promise<FetchedPage[]> {
  const url = normalizeWebUrl(args.url);
  if (!url) throw new Error('jina_missing_url');

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (args.format === 'text') headers['X-Return-Format'] = 'text';
  const res = await fetch(`${JINA_READER_URL}${url}`, {
    headers,
    cache: 'no-store',
    signal: opts.signal,
  });
  if (!res.ok) throw new SearchStatusError(res.status);

  const body: unknown = await res.json();
  const data = isRecord(body) && isRecord(body.data) ? body.data : {};
  const content = typeof data.content === 'string' ? data.content : '';
  if (!content) return [];
  return [{ url: typeof data.url === 'string' ? data.url : url, raw_content: content }];
}
