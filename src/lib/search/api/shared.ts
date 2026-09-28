// Module: search/api/shared
// Responsibility: What every search backend needs: a safe page URL and a refusal with its status.

/** A response a search service refused, with its status for the provider to put in words. */
export class SearchStatusError extends Error {
  constructor(readonly status: number) {
    super(`search_error_${status}`);
  }
}

/** An http(s) URL in canonical form, or '' for anything else. */
export function normalizeWebUrl(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}
