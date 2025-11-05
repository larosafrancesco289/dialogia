import { apiDefaults } from '@/lib/api/config';

type AbortConfig = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type AbortCleanup = {
  signal: AbortSignal;
  cleanup: () => void;
};

function hasContentType(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
}

export function toBodyInit(body: unknown): BodyInit | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return body as unknown as BodyInit;
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return body;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return body;
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return body as unknown as BodyInit;
  }
  return JSON.stringify(body);
}

export function withAbortTimeout({ signal, timeoutMs }: AbortConfig = {}): AbortCleanup {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListenerAttached = false;

  const cleanup = () => {
    if (timeout) clearTimeout(timeout);
    if (abortListenerAttached && signal) {
      signal.removeEventListener('abort', onAbort);
    }
  };

  const onAbort = () => controller.abort(signal?.reason);

  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  }

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
      abortListenerAttached = true;
    }
  }

  return { signal: controller.signal, cleanup };
}

type HeaderOptions = {
  origin?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  includeDefaults?: boolean;
  defaultContentType?: string | null;
};

export function buildApiHeaders({
  origin,
  headers,
  body,
  includeDefaults = true,
  defaultContentType,
}: HeaderOptions): { headers: Record<string, string>; origin: string } {
  const resolvedOrigin = apiDefaults.resolveOrigin(origin);
  const baseHeaders = includeDefaults ? apiDefaults.headers(resolvedOrigin) : {};
  const nextHeaders: Record<string, string> = {
    ...baseHeaders,
    ...(headers ?? {}),
  };

  if (body != null) {
    const contentType =
      defaultContentType === undefined ? 'application/json' : defaultContentType;
    if (contentType && !hasContentType(nextHeaders)) {
      nextHeaders['Content-Type'] = contentType;
    }
  }

  return { headers: nextHeaders, origin: resolvedOrigin };
}
