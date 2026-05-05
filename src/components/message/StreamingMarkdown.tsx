'use client';

import { useEffect, useRef, useState } from 'react';
import { Markdown, type MarkdownCitationSource } from '@/components/Markdown';

const MIN_INTERVAL_MS = 80;
const MAX_INTERVAL_MS = 220;
const LARGE_DELTA = 360;

function shouldUpdateImmediately(next: string, delta: number) {
  if (delta >= LARGE_DELTA) return true;
  if (next.endsWith('\n')) return true;
  if (next.endsWith('```')) return true;
  if (next.endsWith('|')) return true;
  return false;
}

export function StreamingMarkdown({
  content,
  sources,
}: {
  content: string;
  sources?: MarkdownCitationSource[];
}) {
  const [rendered, setRendered] = useState(content);
  const lastUpdateAt = useRef<number>(0);
  const pending = useRef<string | null>(null);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (content === rendered) return;
    pending.current = content;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = now - lastUpdateAt.current;
    const delta = Math.max(0, content.length - rendered.length);
    const immediate = shouldUpdateImmediately(content, delta);
    const delay = immediate ? 0 : Math.max(0, MIN_INTERVAL_MS - elapsed);
    const maxDelay = Math.max(0, MAX_INTERVAL_MS - elapsed);
    const scheduleDelay = Math.min(delay, maxDelay);

    if (timeoutId.current) clearTimeout(timeoutId.current);
    timeoutId.current = setTimeout(() => {
      if (pending.current == null) return;
      lastUpdateAt.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
      setRendered(pending.current);
      pending.current = null;
    }, scheduleDelay);

    return () => {
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [content, rendered]);

  useEffect(() => {
    return () => {
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, []);

  if (!rendered) return null;
  return <Markdown content={rendered} sources={sources} />;
}
