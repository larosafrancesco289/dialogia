'use client';

import { Markdown, type MarkdownCitationSource } from '@/components/Markdown';

export function StreamingMarkdown({
  content,
  sources,
}: {
  content: string;
  sources?: MarkdownCitationSource[];
}) {
  if (!content) return null;
  return <Markdown content={content} sources={sources} />;
}
