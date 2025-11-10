import { extractMainText } from '@/lib/html';

const PUBLISHED_META_PATTERNS = [
  /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["'][^>]*>/i,
];

const detectPublishedAt = (html: string): string | undefined => {
  for (const pattern of PUBLISHED_META_PATTERNS) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
};

export function summarizeHtmlDocument(html: string): {
  title?: string;
  description?: string;
  headings?: string[];
  text?: string;
  published?: string;
} {
  const { title, description, headings, text } = extractMainText(html);
  const published = detectPublishedAt(html);
  return { title, description, headings, text, published };
}
