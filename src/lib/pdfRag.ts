import { estimateTokens } from '@/lib/tokenEstimate';

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

export function selectExcerptsFromPdfText(params: {
  text: string;
  query: string;
  tokenBudget: number; // approx tokens
  chunkChars?: number; // approx chars per chunk
}): string {
  const { text, query, tokenBudget, chunkChars = 2500 } = params;
  const safeText = (text || '').trim();
  if (!safeText) return '';
  const words = tokenizeWords(query || '');
  const keywords = new Set(words);
  const chunks: { start: number; end: number; content: string; score: number }[] = [];
  for (let i = 0; i < safeText.length; i += chunkChars) {
    const slice = safeText.slice(i, i + chunkChars);
    const sliceWords = tokenizeWords(slice);
    let score = 0;
    if (keywords.size > 0) {
      for (const w of sliceWords) if (keywords.has(w)) score++;
    } else {
      score = 1; // no query provided, keep order
    }
    chunks.push({ start: i, end: i + chunkChars, content: slice, score });
  }
  // Sort by score desc, then by order asc if scores tie
  chunks.sort((a, b) => b.score - a.score || a.start - b.start);
  const out: string[] = [];
  let used = 0;
  for (const ch of chunks) {
    const t = estimateTokens(ch.content) || 0;
    if (used + t > tokenBudget) break;
    out.push(ch.content.trim());
    used += t;
    if (used >= tokenBudget) break;
  }
  return out.join('\n\n');
}
